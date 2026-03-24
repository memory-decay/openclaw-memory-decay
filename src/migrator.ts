import { readdir, readFile, writeFile, access } from "node:fs/promises";
import { join, basename } from "node:path";
import { MemoryDecayClient } from "./client.js";
import type { StoreRequest } from "./types.js";

const MIGRATION_MARKER = ".migration-done";

export async function shouldMigrate(persistenceDir: string): Promise<boolean> {
  try {
    await access(join(persistenceDir, MIGRATION_MARKER));
    return false;
  } catch {
    return true;
  }
}

export async function migrateMarkdownMemories(
  memoryDir: string,
  client: MemoryDecayClient,
  persistenceDir: string,
): Promise<{ migrated: number; files: number }> {
  const files = await readdir(memoryDir);
  const mdFiles = files.filter((f) => f.endsWith(".md"));

  const allItems: StoreRequest[] = [];

  for (const file of mdFiles) {
    const content = await readFile(join(memoryDir, file), "utf-8");
    const sections = splitIntoSections(content);
    const isDateFile = /^\d{4}-\d{2}-\d{2}\.md$/.test(file);
    const isCurated = file === "MEMORY.md" || file.startsWith("MEMORY");

    const importance = isCurated ? 0.7 : isDateFile ? 0.4 : 0.5;

    for (const section of sections) {
      if (section.trim().length < 10) continue;
      allItems.push({
        text: section.trim(),
        importance,
        mtype: isDateFile ? "episode" : "fact",
        category: isCurated ? "curated" : "migrated",
      });
    }
  }

  if (allItems.length > 0) {
    for (let i = 0; i < allItems.length; i += 50) {
      const chunk = allItems.slice(i, i + 50);
      await client.storeBatch(chunk);
    }
  }

  await writeFile(
    join(persistenceDir, MIGRATION_MARKER),
    JSON.stringify({ migratedAt: new Date().toISOString(), count: allItems.length, files: mdFiles.length }),
  );

  return { migrated: allItems.length, files: mdFiles.length };
}

function splitIntoSections(markdown: string): string[] {
  const sections = markdown.split(/\n(?=#{1,3} )/);
  const result: string[] = [];

  for (const section of sections) {
    if (section.length > 500) {
      const paragraphs = section.split(/\n\n+/);
      result.push(...paragraphs);
    } else {
      result.push(section);
    }
  }

  return result;
}

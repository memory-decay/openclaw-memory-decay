#!/usr/bin/env node
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === "win32";
const candidates = isWin ? ["python"] : ["python3", "python"];

const python = candidates.find((py) => {
  try {
    execSync(
      `${py} -c "import memory_decay; import sqlite3; sqlite3.connect(':memory:').enable_load_extension(True)"`,
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
});

if (!python) {
  console.warn("[memory-decay] memory_decay not found — run: pip install memory-decay");
  process.exit(0);
}

const pythonPath = execSync(isWin ? `where ${python}` : `which ${python}`, { encoding: "utf8" }).trim().split("\n")[0];
const memoryDecayPath = execSync(
  `${python} -c "import memory_decay,os; print(os.path.dirname(os.path.dirname(memory_decay.__file__)))"`,
  { encoding: "utf8" }
).trim();

writeFileSync(resolve(root, "../.python-env.json"), JSON.stringify({ pythonPath, memoryDecayPath }, null, 2));
console.log(`[memory-decay] Detected: ${pythonPath}`);

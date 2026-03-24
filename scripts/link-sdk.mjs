#!/usr/bin/env node
/**
 * Links the global openclaw package into this plugin's node_modules
 * so that `import ... from "openclaw/plugin-sdk"` resolves correctly.
 */
import { existsSync, symlinkSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const target = join(projectRoot, "node_modules", "openclaw");

if (existsSync(target)) {
  console.log("openclaw SDK already linked.");
  process.exit(0);
}

// Find global openclaw installation
let globalRoot;
try {
  globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf-8" }).trim();
} catch {
  console.error("Failed to find global npm root. Is npm installed?");
  process.exit(1);
}

const globalOpenclaw = join(globalRoot, "openclaw");
if (!existsSync(globalOpenclaw)) {
  console.error(
    `openclaw not found at ${globalOpenclaw}\n` +
    "Install it globally first: npm i -g openclaw"
  );
  process.exit(1);
}

mkdirSync(join(projectRoot, "node_modules"), { recursive: true });
symlinkSync(globalOpenclaw, target, "junction");
console.log(`Linked openclaw SDK: ${target} -> ${globalOpenclaw}`);

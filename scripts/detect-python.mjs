#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectPythonEnv } from "./detect-python-lib.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const detected = detectPythonEnv({ pluginRoot: resolve(root, "..") });

if (!detected) {
  console.warn(
    "[memory-decay] memory_decay server not found in an active or sibling Python environment. " +
    "Install the backend in a venv and rerun install, or set pythonPath in plugin config.",
  );
  process.exit(0);
}

writeFileSync(resolve(root, "../.python-env.json"), JSON.stringify(detected, null, 2));
console.log(`[memory-decay] Detected: ${detected.pythonPath}`);

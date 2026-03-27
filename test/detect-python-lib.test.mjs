import test from "node:test";
import assert from "node:assert/strict";

import {
  detectPythonEnv,
  resolveMemoryDecayPath,
} from "../scripts/detect-python-lib.mjs";

test("detectPythonEnv prefers sibling backend venv over PATH python", () => {
  const pluginRoot = "/workspace/openclaw-memory-decay";
  const siblingVenv = "/workspace/memory-decay-core/.venv/bin/python";
  const calls = [];
  const fakeTempDir = "/tmp/memory-decay-python-env-123";
  const fakeOutputPath = `${fakeTempDir}/memory-decay-module-path.txt`;

  const result = detectPythonEnv({
    pluginRoot,
    isWin: false,
    env: {},
    existsSync(path) {
      return path === siblingVenv;
    },
    makeTempDir() {
      return fakeTempDir;
    },
    readPathFile(path) {
      assert.equal(path, fakeOutputPath);
      return "/workspace/memory-decay-core/src/memory_decay/__init__.py\n";
    },
    removeTempDir(path) {
      assert.equal(path, fakeTempDir);
    },
    execFileSync(file, args, options = {}) {
      calls.push([file, args]);

      if (file === siblingVenv && args[0] === "-c" && args[1] === "import memory_decay.server") {
        return "";
      }

      if (
        file === siblingVenv &&
        args[0] === "-c" &&
        args[1] === `import memory_decay, pathlib; pathlib.Path(${JSON.stringify(fakeOutputPath)}).write_text(str(pathlib.Path(memory_decay.__file__).resolve()))`
      ) {
        return "";
      }

      if (file === "which" && args[0] === "python3") {
        return "/usr/bin/python3\n";
      }

      throw new Error(`Unexpected call: ${file} ${args.join(" ")}`);
    },
  });

  assert.deepEqual(result, {
    pythonPath: siblingVenv,
    memoryDecayPath: "/workspace/memory-decay-core",
  });
  assert.deepEqual(calls.slice(0, 2), [
    [siblingVenv, ["-c", "import memory_decay.server"]],
    [siblingVenv, ["-c", `import memory_decay, pathlib; pathlib.Path(${JSON.stringify(fakeOutputPath)}).write_text(str(pathlib.Path(memory_decay.__file__).resolve()))`]],
  ]);
});

test("detectPythonEnv returns null when PATH python cannot import memory_decay.server", () => {
  assert.equal(
    detectPythonEnv({
      pluginRoot: "/workspace/openclaw-memory-decay",
      isWin: false,
      env: {},
      existsSync() {
        return false;
      },
      execFileSync() {
        throw new Error("memory_decay.server missing");
      },
    }),
    null,
  );
});

test("resolveMemoryDecayPath collapses editable src layout to repo root", () => {
  assert.equal(
    resolveMemoryDecayPath("/workspace/memory-decay/src/memory_decay/__init__.py"),
    "/workspace/memory-decay",
  );
});

test("resolveMemoryDecayPath keeps installed package parent for site-packages", () => {
  assert.equal(
    resolveMemoryDecayPath("/venv/lib/python3.12/site-packages/memory_decay/__init__.py"),
    "/venv/lib/python3.12/site-packages",
  );
});

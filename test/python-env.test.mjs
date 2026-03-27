import test from "node:test";
import assert from "node:assert/strict";

import {
  detectPythonEnv,
  mergePythonEnv,
} from "../dist/python-env.js";

test("mergePythonEnv keeps configured memoryDecayPath while filling missing pythonPath from detection", () => {
  assert.deepEqual(
    mergePythonEnv(
      { memoryDecayPath: "/configured/core", pythonPath: "" },
      { memoryDecayPath: "/detected/core", pythonPath: "/detected/python" },
    ),
    {
      memoryDecayPath: "/configured/core",
      pythonPath: "/detected/python",
    },
  );
});

test("mergePythonEnv preserves explicit config over detected values", () => {
  assert.deepEqual(
    mergePythonEnv(
      { memoryDecayPath: "/configured/core", pythonPath: "/configured/python" },
      { memoryDecayPath: "/detected/core", pythonPath: "/detected/python" },
    ),
    {
      memoryDecayPath: "/configured/core",
      pythonPath: "/configured/python",
    },
  );
});

test("detectPythonEnv finds the documented default venv path for fresh installs", () => {
  const pluginRoot = "/tmp/openclaw/.openclaw/extensions/memory-decay/src";
  const openclawHome = "/tmp/openclaw";
  const recommendedPython = "/tmp/openclaw/.openclaw/venvs/memory-decay/bin/python";
  const fakeTempDir = "/tmp/memory-decay-python-env-test";
  const fakeOutputPath = `${fakeTempDir}/memory-decay-module-path.txt`;
  const calls = [];

  const detected = detectPythonEnv({
    pluginRoot,
    env: { OPENCLAW_HOME: openclawHome },
    isWin: false,
    homedir() {
      return "/home/unused";
    },
    existsSync(path) {
      return path === recommendedPython;
    },
    makeTempDir() {
      return fakeTempDir;
    },
    readPathFile(path) {
      assert.equal(path, fakeOutputPath);
      return "/home/user/.openclaw/venvs/memory-decay/lib/python3.12/site-packages/memory_decay/__init__.py\n";
    },
    removeTempDir(path) {
      assert.equal(path, fakeTempDir);
    },
    execFileSync(file, args) {
      calls.push([file, args]);

      if (file === recommendedPython && args[0] === "-c" && args[1] === "import memory_decay.server") {
        return Buffer.from("");
      }

      if (
        file === recommendedPython &&
        args[0] === "-c" &&
        args[1] === `import memory_decay, pathlib; pathlib.Path(${JSON.stringify(fakeOutputPath)}).write_text(str(pathlib.Path(memory_decay.__file__).resolve()))`
      ) {
        return Buffer.from("");
      }

      throw new Error(`Unexpected call: ${file} ${args.join(" ")}`);
    },
  });

  assert.deepEqual(detected, {
    pythonPath: recommendedPython,
    memoryDecayPath: "/home/user/.openclaw/venvs/memory-decay/lib/python3.12/site-packages",
  });
  assert.deepEqual(calls, [
    [recommendedPython, ["-c", "import memory_decay.server"]],
    [recommendedPython, ["-c", `import memory_decay, pathlib; pathlib.Path(${JSON.stringify(fakeOutputPath)}).write_text(str(pathlib.Path(memory_decay.__file__).resolve()))`]],
  ]);
});

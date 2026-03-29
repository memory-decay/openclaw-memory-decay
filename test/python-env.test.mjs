import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPythonCandidates,
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
      backendVersion: "unknown",
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
      backendVersion: "unknown",
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

      if (
        file === recommendedPython &&
        args[0] === "-c" &&
        args[1] === "import memory_decay; print(getattr(memory_decay, \"__version__\", \"unknown\"))"
      ) {
        return Buffer.from("0.1.3\n");
      }

      throw new Error(`Unexpected call: ${file} ${args.join(" ")}`);
    },
  });

  assert.deepEqual(detected, {
    pythonPath: recommendedPython,
    memoryDecayPath: "/home/user/.openclaw/venvs/memory-decay/lib/python3.12/site-packages",
    backendVersion: "unknown",
  });
  assert.deepEqual(calls, [
    [recommendedPython, ["-c", "import memory_decay.server"]],
    [recommendedPython, ["-c", `import memory_decay, pathlib; pathlib.Path(${JSON.stringify(fakeOutputPath)}).write_text(str(pathlib.Path(memory_decay.__file__).resolve()))`]],
    [recommendedPython, ["-c", "import memory_decay; print(getattr(memory_decay, \"__version__\", \"unknown\"))"]],
  ]);
});

test("buildPythonCandidates includes common versioned python commands for system installs", () => {
  const candidates = buildPythonCandidates({
    pluginRoot: "/tmp/openclaw/.openclaw/extensions/openclaw-memory-decay/src",
    env: {},
    isWin: false,
    homedir() {
      return "/home/unused";
    },
    existsSync() {
      return false;
    },
  });

  assert.deepEqual(
    candidates.slice(-6),
    ["python3", "python", "python3.13", "python3.12", "python3.11", "python3.10"],
  );
});

test("detectPythonEnv falls back to a versioned python command when default paths are absent", () => {
  const fakeTempDir = "/tmp/memory-decay-versioned-python-env-test";
  const fakeOutputPath = `${fakeTempDir}/memory-decay-module-path.txt`;
  const calls = [];

  const detected = detectPythonEnv({
    pluginRoot: "/tmp/openclaw/.openclaw/extensions/openclaw-memory-decay/src",
    env: {},
    isWin: false,
    homedir() {
      return "/home/unused";
    },
    existsSync() {
      return false;
    },
    makeTempDir() {
      return fakeTempDir;
    },
    readPathFile(path) {
      assert.equal(path, fakeOutputPath);
      return "/usr/lib/python3.12/site-packages/memory_decay/__init__.py\n";
    },
    removeTempDir(path) {
      assert.equal(path, fakeTempDir);
    },
    execFileSync(file, args, options) {
      calls.push([file, args]);

      if (file === "python3.12" && args[0] === "-c" && args[1] === "import memory_decay.server") {
        return Buffer.from("");
      }

      if (
        file === "python3.12" &&
        args[0] === "-c" &&
        args[1] === `import memory_decay, pathlib; pathlib.Path(${JSON.stringify(fakeOutputPath)}).write_text(str(pathlib.Path(memory_decay.__file__).resolve()))`
      ) {
        return Buffer.from("");
      }

      if (file === "which" && args[0] === "python3.12") {
        return "/usr/bin/python3.12\n";
      }

      if (
        file === "python3.12" &&
        args[0] === "-c" &&
        args[1] === "import memory_decay; print(getattr(memory_decay, \"__version__\", \"unknown\"))"
      ) {
        return Buffer.from("0.1.3\n");
      }

      throw new Error(`Unexpected call: ${file} ${args.join(" ")}`);
    },
  });

  assert.deepEqual(detected, {
    pythonPath: "/usr/bin/python3.12",
    memoryDecayPath: "/usr/lib/python3.12/site-packages",
    backendVersion: "unknown",
  });
  assert.deepEqual(calls.slice(-4), [
    ["python3.12", ["-c", "import memory_decay.server"]],
    ["python3.12", ["-c", `import memory_decay, pathlib; pathlib.Path(${JSON.stringify(fakeOutputPath)}).write_text(str(pathlib.Path(memory_decay.__file__).resolve()))`]],
    ["python3.12", ["-c", "import memory_decay; print(getattr(memory_decay, \"__version__\", \"unknown\"))"]],
    ["which", ["python3.12"]],
  ]);
});

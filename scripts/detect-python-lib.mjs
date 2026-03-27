import { execFileSync as nodeExecFileSync } from "node:child_process";
import { existsSync as nodeExistsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir as nodeHomedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

const PYTHON_COMMAND_CANDIDATES = process.platform === "win32"
  ? ["python"]
  : ["python3", "python", "python3.13", "python3.12", "python3.11", "python3.10"];

function resolvePythonPath(command, { execFileSync = nodeExecFileSync, isWin = process.platform === "win32" } = {}) {
  if (isAbsolute(command)) {
    return command;
  }

  const resolver = isWin ? "where" : "which";
  return execFileSync(resolver, [command], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
}

export function resolveMemoryDecayPath(moduleFile) {
  const packageDir = dirname(resolve(moduleFile));
  const packageParent = dirname(packageDir);
  return basename(packageParent) === "src" ? dirname(packageParent) : packageParent;
}

export function buildPythonCandidates({
  pluginRoot,
  env = process.env,
  isWin = process.platform === "win32",
  existsSync = nodeExistsSync,
  homedir = nodeHomedir,
} = {}) {
  const openclawStateDir = resolve(env.OPENCLAW_HOME || homedir(), ".openclaw");
  const siblingRoots = [
    resolve(pluginRoot, "../memory-decay"),
    resolve(pluginRoot, "../memory-decay-core"),
  ];
  const pathCandidates = [];

  if (env.MD_PYTHON_PATH) pathCandidates.push(env.MD_PYTHON_PATH);
  pathCandidates.push(
    join(openclawStateDir, "venvs", "memory-decay", isWin ? "Scripts/python.exe" : "bin/python"),
  );
  if (env.VIRTUAL_ENV) {
    pathCandidates.push(join(env.VIRTUAL_ENV, isWin ? "Scripts/python.exe" : "bin/python"));
  }
  for (const root of siblingRoots) {
    pathCandidates.push(join(root, isWin ? ".venv/Scripts/python.exe" : ".venv/bin/python"));
  }

  const commandCandidates = isWin ? ["python"] : PYTHON_COMMAND_CANDIDATES;
  return [...new Set([
    ...pathCandidates.filter((candidate) => existsSync(candidate)),
    ...commandCandidates,
  ])];
}

export function detectPythonEnv({
  pluginRoot,
  env = process.env,
  isWin = process.platform === "win32",
  existsSync = nodeExistsSync,
  execFileSync = nodeExecFileSync,
  makeTempDir = () => mkdtempSync(join(tmpdir(), "memory-decay-python-env-")),
  readPathFile = (path) => readFileSync(path, "utf8"),
  removeTempDir = (path) => rmSync(path, { recursive: true, force: true }),
} = {}) {
  for (const candidate of buildPythonCandidates({ pluginRoot, env, isWin, existsSync })) {
    try {
      execFileSync(candidate, ["-c", "import memory_decay.server"], { stdio: "ignore" });
      const tempDir = makeTempDir();
      const outputPath = join(tempDir, "memory-decay-module-path.txt");

      try {
        execFileSync(candidate, [
          "-c",
          `import memory_decay, pathlib; pathlib.Path(${JSON.stringify(outputPath)}).write_text(str(pathlib.Path(memory_decay.__file__).resolve()))`,
        ], { stdio: "ignore" });
      } catch (error) {
        removeTempDir(tempDir);
        throw error;
      }

      const moduleFile = readPathFile(outputPath).trim();
      removeTempDir(tempDir);

      return {
        pythonPath: resolvePythonPath(candidate, { execFileSync, isWin }),
        memoryDecayPath: resolveMemoryDecayPath(moduleFile),
      };
    } catch {}
  }

  return null;
}

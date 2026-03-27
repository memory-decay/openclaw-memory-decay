import { execFileSync as nodeExecFileSync } from "node:child_process";
import { existsSync as nodeExistsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir as nodeHomedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export interface PythonEnvLike {
  memoryDecayPath?: string;
  pythonPath?: string;
}

interface DetectPythonEnvOptions {
  pluginRoot: string;
  env?: NodeJS.ProcessEnv;
  isWin?: boolean;
  homedir?: () => string;
  existsSync?: (path: string) => boolean;
  execFileSync?: typeof nodeExecFileSync;
  makeTempDir?: () => string;
  readPathFile?: (path: string) => string;
  removeTempDir?: (path: string) => void;
}

const PYTHON_COMMAND_CANDIDATES = process.platform === "win32"
  ? ["python"]
  : ["python3", "python", "python3.13", "python3.12", "python3.11", "python3.10"];

export function mergePythonEnv(
  configured: PythonEnvLike,
  detected: PythonEnvLike = {},
): { memoryDecayPath: string; pythonPath: string } {
  return {
    memoryDecayPath: configured.memoryDecayPath || detected.memoryDecayPath || "",
    pythonPath: configured.pythonPath || detected.pythonPath || "",
  };
}

function resolveOpenClawStateDir(
  env: NodeJS.ProcessEnv,
  homedir: () => string,
): string {
  return resolve(env.OPENCLAW_HOME || homedir(), ".openclaw");
}

export function resolveMemoryDecayPath(moduleFile: string): string {
  const packageDir = dirname(resolve(moduleFile));
  const packageParent = dirname(packageDir);
  return basename(packageParent) === "src" ? dirname(packageParent) : packageParent;
}

export function buildPythonCandidates({
  pluginRoot,
  env = process.env,
  isWin = process.platform === "win32",
  homedir = nodeHomedir,
  existsSync = nodeExistsSync,
}: Omit<DetectPythonEnvOptions, "execFileSync" | "makeTempDir" | "readPathFile" | "removeTempDir">): string[] {
  const siblingRoots = [
    resolve(pluginRoot, "../../memory-decay"),
    resolve(pluginRoot, "../../memory-decay-core"),
    resolve(pluginRoot, "../memory-decay"),
    resolve(pluginRoot, "../memory-decay-core"),
  ];
  const openclawStateDir = resolveOpenClawStateDir(env, homedir);
  const recommendedVenv = join(
    openclawStateDir,
    "venvs",
    "memory-decay",
    isWin ? "Scripts/python.exe" : "bin/python",
  );
  const pathCandidates = [
    env.MD_PYTHON_PATH,
    recommendedVenv,
    env.VIRTUAL_ENV
      ? join(env.VIRTUAL_ENV, isWin ? "Scripts/python.exe" : "bin/python")
      : undefined,
    ...siblingRoots.map((root) =>
      join(root, isWin ? ".venv/Scripts/python.exe" : ".venv/bin/python")),
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0 && existsSync(candidate));

  const commandCandidates = isWin ? ["python"] : PYTHON_COMMAND_CANDIDATES;
  return [...new Set([...pathCandidates, ...commandCandidates])];
}

function resolvePythonPath(
  command: string,
  {
    execFileSync = nodeExecFileSync,
    isWin = process.platform === "win32",
  }: Pick<DetectPythonEnvOptions, "execFileSync" | "isWin"> = {},
): string {
  if (isAbsolute(command)) {
    return command;
  }

  const resolver = isWin ? "where" : "which";
  return execFileSync(resolver, [command], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
}

export function detectPythonEnv({
  pluginRoot,
  env = process.env,
  isWin = process.platform === "win32",
  homedir = nodeHomedir,
  existsSync = nodeExistsSync,
  execFileSync = nodeExecFileSync,
  makeTempDir = () => mkdtempSync(join(tmpdir(), "memory-decay-python-env-")),
  readPathFile = (path) => readFileSync(path, "utf8"),
  removeTempDir = (path) => rmSync(path, { recursive: true, force: true }),
}: DetectPythonEnvOptions): { memoryDecayPath: string; pythonPath: string } | null {
  for (const candidate of buildPythonCandidates({ pluginRoot, env, isWin, homedir, existsSync })) {
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

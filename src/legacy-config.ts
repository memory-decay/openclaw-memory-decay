import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type PluginConfigLike = Record<string, unknown>;

function resolveOpenClawConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.OPENCLAW_HOME || homedir(), ".openclaw", "openclaw.json");
}

export function loadLegacyPluginConfig(
  currentConfig: PluginConfigLike,
  {
    env = process.env,
    configPath = resolveOpenClawConfigPath(env),
  }: { env?: NodeJS.ProcessEnv; configPath?: string } = {},
): PluginConfigLike {
  if (Object.keys(currentConfig).length > 0) {
    return currentConfig;
  }

  if (!existsSync(configPath)) {
    return currentConfig;
  }

  try {
    const root = JSON.parse(readFileSync(configPath, "utf8"));
    const legacyConfig = root?.plugins?.entries?.["memory-decay"]?.config;
    return legacyConfig && typeof legacyConfig === "object"
      ? { ...legacyConfig }
      : currentConfig;
  } catch {
    return currentConfig;
  }
}

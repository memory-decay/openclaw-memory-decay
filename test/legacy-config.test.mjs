import test from "node:test";
import assert from "node:assert/strict";
import { unlinkSync, writeFileSync } from "node:fs";

import { loadLegacyPluginConfig } from "../dist/legacy-config.js";

test("loadLegacyPluginConfig keeps current config when current key is present", () => {
  assert.deepEqual(
    loadLegacyPluginConfig(
      { pythonPath: "/current/python" },
      { configPath: "/does/not/exist" },
    ),
    { pythonPath: "/current/python" },
  );
});

test("loadLegacyPluginConfig reads old memory-decay config when current key is empty", () => {
  const configPath = "/tmp/openclaw-legacy-config-test.json";
  const legacyJson = JSON.stringify({
    plugins: {
      entries: {
        "memory-decay": {
          config: {
            pythonPath: "/legacy/python",
            memoryDecayPath: "/legacy/core",
          },
        },
      },
    },
  });

  assert.deepEqual(
    loadLegacyPluginConfig(
      {},
      {
        configPath,
      },
    ),
    {},
    "sanity check before file creation should return empty current config",
  );

  writeFileSync(configPath, legacyJson);
  try {
    assert.deepEqual(
      loadLegacyPluginConfig({}, { configPath }),
      {
        pythonPath: "/legacy/python",
        memoryDecayPath: "/legacy/core",
      },
    );
  } finally {
    unlinkSync(configPath);
  }
});

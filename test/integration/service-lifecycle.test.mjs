import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { MemoryDecayService } from "../../dist/service.js";
import { MemoryDecayClient } from "../../dist/client.js";
import {
  createMockLogger,
  createTempDb,
  createCorruptDb,
  resolveTestConfig,
  waitForExit,
  pollUntil,
} from "./helpers.mjs";

// Shared state per test — cleaned up in afterEach
let service = null;
let client = null;
let logger = null;
let cleanup = null;

afterEach(async () => {
  if (service) {
    try {
      service.stop();
      await waitForExit(service, 5000).catch(() => {});
    } catch {}
    service = null;
  }
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  client = null;
  logger = null;
});

// ---------------------------------------------------------------------------
// 1. Normal startup and operations
// ---------------------------------------------------------------------------

describe("normal startup and operations", () => {
  it("server starts and passes health check", { timeout: 60000 }, async () => {
    logger = createMockLogger();
    const resolved = await resolveTestConfig();
    cleanup = resolved.cleanup;

    service = new MemoryDecayService(resolved.config, logger);
    client = new MemoryDecayClient(resolved.config.port);

    await service.start();

    const health = await client.health();
    assert.equal(health.status, "ok");
    assert.equal(logger.calls.error.length, 0, `Unexpected errors: ${logger.calls.error.join("; ")}`);
  });

  it("store and search round-trip", { timeout: 60000 }, async () => {
    logger = createMockLogger();
    const resolved = await resolveTestConfig();
    cleanup = resolved.cleanup;

    service = new MemoryDecayService(resolved.config, logger);
    client = new MemoryDecayClient(resolved.config.port);

    await service.start();

    // Store a memory
    const storeRes = await client.store({
      text: "integration test memory xyz123 unique marker",
      importance: 0.8,
      mtype: "fact",
    });
    assert.ok(storeRes.id, "Store should return an id");

    // Search for it — using identical text ensures deterministic vector match
    const searchRes = await client.search({
      query: "integration test memory xyz123 unique marker",
      top_k: 1,
    });
    assert.ok(searchRes.results.length > 0, "Search should return at least one result");
    assert.ok(
      searchRes.results[0].text.includes("xyz123"),
      `Expected result to contain 'xyz123', got: ${searchRes.results[0].text}`
    );
  });

  it("clean shutdown", { timeout: 60000 }, async () => {
    logger = createMockLogger();
    const resolved = await resolveTestConfig();
    cleanup = resolved.cleanup;

    service = new MemoryDecayService(resolved.config, logger);
    await service.start();

    service.stop();
    await waitForExit(service, 5000);

    assert.equal(logger.calls.error.length, 0, `Unexpected errors: ${logger.calls.error.join("; ")}`);
  });
});

// ---------------------------------------------------------------------------
// 2. Corrupt DB scenario
// ---------------------------------------------------------------------------

describe("corrupt DB scenario", () => {
  it("corrupt DB causes exit with stderr context in logs", { timeout: 60000 }, async () => {
    logger = createMockLogger();
    const corrupt = createCorruptDb();
    const resolved = await resolveTestConfig({ dbPath: corrupt.dbPath });
    cleanup = () => {
      resolved.cleanup();
      corrupt.cleanup();
    };

    service = new MemoryDecayService(resolved.config, logger);

    // start() should throw because health check times out after server crashes
    await assert.rejects(
      () => service.start(),
      (err) => {
        assert.ok(err.message.includes("failed to start"), `Expected timeout error, got: ${err.message}`);
        return true;
      },
    );

    // Verify stderr context appeared in error logs
    const allErrors = logger.calls.error.join("\n");
    assert.ok(
      allErrors.includes("Last stderr:"),
      `Expected 'Last stderr:' in error logs, got:\n${allErrors}`,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Crash and restart recovery
// ---------------------------------------------------------------------------

describe("crash and restart recovery", () => {
  it("server auto-restarts after kill and recovers", { timeout: 60000 }, async () => {
    logger = createMockLogger();
    const resolved = await resolveTestConfig();
    cleanup = resolved.cleanup;

    service = new MemoryDecayService(resolved.config, logger);
    client = new MemoryDecayClient(resolved.config.port);

    await service.start();

    // Confirm healthy
    const healthBefore = await client.health();
    assert.equal(healthBefore.status, "ok");

    // Kill the Python process (simulates crash)
    const proc = service["process"];
    assert.ok(proc, "Service should have a running process");
    proc.kill("SIGKILL");

    // Wait for restart and health recovery
    await pollUntil(async () => {
      try {
        const h = await client.health();
        return h.status === "ok";
      } catch {
        return false;
      }
    }, { timeoutMs: 30000, intervalMs: 1000 });

    // Verify restart was logged
    const allErrors = logger.calls.error.join("\n");
    assert.ok(
      allErrors.includes("restarting (1/3)"),
      `Expected 'restarting (1/3)' in error logs, got:\n${allErrors}`,
    );

    // Verify functional recovery — store and search work after restart
    const storeRes = await client.store({
      text: "post-restart memory test",
      importance: 0.5,
      mtype: "episode",
    });
    assert.ok(storeRes.id, "Store should work after restart");
  });

  it("max restarts exhausted", { timeout: 60000 }, async () => {
    logger = createMockLogger();
    const corrupt = createCorruptDb();
    const resolved = await resolveTestConfig({ dbPath: corrupt.dbPath });
    cleanup = () => {
      resolved.cleanup();
      corrupt.cleanup();
    };

    service = new MemoryDecayService(resolved.config, logger);

    // start() should throw — server crashes on startup, exhausts all retries
    await assert.rejects(() => service.start());

    // Wait a moment for all restart attempts to complete and log
    await new Promise((r) => setTimeout(r, 3000));

    const allErrors = logger.calls.error.join("\n");
    assert.ok(
      allErrors.includes("max restarts"),
      `Expected 'max restarts' in error logs, got:\n${allErrors}`,
    );
  });
});

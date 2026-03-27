import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Create a mock logger that captures all calls for assertion.
 * Compatible with the Logger interface in service.ts.
 */
export function createMockLogger() {
  const calls = { info: [], warn: [], error: [], debug: [] };
  return {
    info: (msg) => calls.info.push(msg),
    warn: (msg) => calls.warn.push(msg),
    error: (msg) => calls.error.push(msg),
    debug: (msg) => calls.debug.push(msg),
    calls,
  };
}

/**
 * Create a temporary SQLite DB with the correct schema (including vec0 tables).
 * Requires the memory-decay Python backend to be installed.
 */
export function createTempDb(pythonPath = "python3") {
  const dir = mkdtempSync(join(tmpdir(), "md-test-"));
  const dbPath = join(dir, "test.db");
  execFileSync(pythonPath, [
    "-c",
    `from memory_decay.memory_store import MemoryStore; MemoryStore("${dbPath}", embedding_dim=768); print("ok")`,
  ], { stdio: "pipe" });
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Create a corrupt SQLite DB file that triggers "database disk image is malformed".
 * Uses a valid SQLite header (first 100 bytes) followed by random garbage.
 */
export function createCorruptDb() {
  const dir = mkdtempSync(join(tmpdir(), "md-corrupt-"));
  const dbPath = join(dir, "corrupt.db");

  // Valid SQLite header magic + page size, then garbage
  const header = Buffer.alloc(100, 0);
  header.write("SQLite format 3\0", 0, "ascii");
  // page size = 4096 (big-endian at offset 16)
  header.writeUInt16BE(4096, 16);

  const garbage = randomBytes(4096 * 5);
  writeFileSync(dbPath, Buffer.concat([header, garbage]));

  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Find an available TCP port by binding to port 0.
 */
export function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/**
 * Build a ServiceConfig for integration tests.
 */
export async function resolveTestConfig(overrides = {}) {
  const port = await findFreePort();
  const pythonPath = overrides.pythonPath || "python3";
  const db = overrides.dbPath ? null : createTempDb(pythonPath);

  return {
    config: {
      pythonPath,
      memoryDecayPath: overrides.memoryDecayPath || "/app/memory-decay",
      port,
      dbPath: overrides.dbPath || db.dbPath,
      embeddingProvider: overrides.embeddingProvider || "local",
      ...overrides,
    },
    cleanup: db ? db.cleanup : () => {},
  };
}

/**
 * Wait for the service's underlying process to exit.
 * Accesses private field via bracket notation (TS private is erased at runtime).
 */
export function waitForExit(service, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const proc = service["process"];
    if (!proc) return resolve();

    const timer = setTimeout(() => {
      reject(new Error(`Process did not exit within ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Poll until a condition is met or timeout.
 */
export async function pollUntil(fn, { timeoutMs = 20000, intervalMs = 500 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`pollUntil timed out after ${timeoutMs}ms`);
}

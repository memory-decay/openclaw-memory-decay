import { spawn, type ChildProcess } from "node:child_process";
import { MemoryDecayClient } from "./client.js";

export interface ServiceConfig {
  pythonPath: string;
  memoryDecayPath: string;
  port: number;
  dbPath: string;
  embeddingProvider?: string;
  embeddingModel?: string;
  embeddingApiKey?: string;
  embeddingDim?: number;
  experimentDir?: string;
}

export interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  debug?: (msg: string) => void;
}

export class MemoryDecayService {
  private process: ChildProcess | null = null;
  private client: MemoryDecayClient;
  private config: ServiceConfig;
  private logger: Logger;
  private restartCount = 0;
  private maxRestarts = 3;
  private stderrTail: string[] = [];
  private static readonly STDERR_MAX_LINES = 50;

  constructor(config: ServiceConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.client = new MemoryDecayClient(config.port);
  }

  async start(): Promise<void> {
    this.stderrTail = [];

    const args = [
      "-m", "memory_decay.server",
      "--host", "127.0.0.1",
      "--port", String(this.config.port),
      "--db-path", this.config.dbPath,
    ];
    if (this.config.embeddingProvider) args.push("--embedding-provider", this.config.embeddingProvider);
    if (this.config.embeddingModel) args.push("--embedding-model", this.config.embeddingModel);
    if (this.config.embeddingApiKey) args.push("--embedding-api-key", this.config.embeddingApiKey);
    if (this.config.embeddingDim) args.push("--embedding-dim", String(this.config.embeddingDim));
    if (this.config.experimentDir) args.push("--experiment-dir", this.config.experimentDir);

    this.process = spawn(this.config.pythonPath, args, {
      cwd: this.config.memoryDecayPath,
      env: { ...process.env, PYTHONPATH: `${this.config.memoryDecayPath}/src` },
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.process.stderr?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n").filter(Boolean)) {
        this.stderrTail.push(line);
        if (this.stderrTail.length > MemoryDecayService.STDERR_MAX_LINES) {
          this.stderrTail.shift();
        }
      }
    });

    this.process.stdout?.on("data", (chunk: Buffer) => {
      if (this.logger.debug) {
        this.logger.debug(chunk.toString().trimEnd());
      }
    });

    this.process.on("exit", (code, signal) => {
      if (code !== 0) {
        const context = this.formatStderrContext();
        const sig = signal ? ` (signal: ${signal})` : "";

        if (this.restartCount < this.maxRestarts) {
          this.restartCount++;
          this.logger.error(
            `Server exited with code ${code}${sig}, restarting (${this.restartCount}/${this.maxRestarts})${context}`
          );
          this.start();
        } else {
          this.logger.error(
            `Server exited with code ${code}${sig}, max restarts (${this.maxRestarts}) exhausted${context}`
          );
        }
      }
    });

    await this.waitForHealth();
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.maxRestarts = 0;
      this.process.stdout?.removeAllListeners("data");
      this.process.stderr?.removeAllListeners("data");
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }

  getClient(): MemoryDecayClient {
    return this.client;
  }

  private formatStderrContext(): string {
    return this.stderrTail.length
      ? `\nLast stderr:\n  ${this.stderrTail.slice(-10).join("\n  ")}`
      : "";
  }

  private async waitForHealth(timeoutMs = 15000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        await this.client.health();
        this.restartCount = 0;
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error(`Server failed to start within ${timeoutMs}ms${this.formatStderrContext()}`);
  }
}

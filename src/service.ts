import { spawn, type ChildProcess } from "node:child_process";
import { MemoryDecayClient } from "./client.js";

export interface ServiceConfig {
  pythonPath: string;
  memoryDecayPath: string;
  port: number;
  persistenceDir: string;
  cacheDir?: string;
  embeddingProvider?: string;
  embeddingModel?: string;
  embeddingApiKey?: string;
  experimentDir?: string;
}

export class MemoryDecayService {
  private process: ChildProcess | null = null;
  private client: MemoryDecayClient;
  private config: ServiceConfig;
  private restartCount = 0;
  private maxRestarts = 3;

  constructor(config: ServiceConfig) {
    this.config = config;
    this.client = new MemoryDecayClient(config.port);
  }

  async start(): Promise<void> {
    const args = [
      "-m", "memory_decay.server",
      "--host", "127.0.0.1",
      "--port", String(this.config.port),
      "--persistence-dir", this.config.persistenceDir,
    ];
    if (this.config.cacheDir) args.push("--cache-dir", this.config.cacheDir);
    if (this.config.embeddingProvider) args.push("--embedding-provider", this.config.embeddingProvider);
    if (this.config.embeddingModel) args.push("--embedding-model", this.config.embeddingModel);
    if (this.config.embeddingApiKey) args.push("--embedding-api-key", this.config.embeddingApiKey);
    if (this.config.experimentDir) args.push("--experiment-dir", this.config.experimentDir);

    this.process = spawn(this.config.pythonPath, args, {
      cwd: this.config.memoryDecayPath,
      env: { ...process.env, PYTHONPATH: `${this.config.memoryDecayPath}/src` },
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.process.on("exit", (code) => {
      if (code !== 0 && this.restartCount < this.maxRestarts) {
        this.restartCount++;
        console.error(`[memory-decay] Server exited with ${code}, restarting (${this.restartCount}/${this.maxRestarts})`);
        this.start();
      }
    });

    await this.waitForHealth();
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.maxRestarts = 0;
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }

  getClient(): MemoryDecayClient {
    return this.client;
  }

  private async waitForHealth(timeoutMs = 15000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        await this.client.health();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error(`[memory-decay] Server failed to start within ${timeoutMs}ms`);
  }
}

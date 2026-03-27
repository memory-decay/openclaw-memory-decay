import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { MemoryDecayClient } from "./client.js";
import { MemoryDecayService, type ServiceConfig } from "./service.js";
import { shouldMigrate, migrateMarkdownMemories } from "./migrator.js";
import { toFreshness } from "./types.js";

const BOOTSTRAP_PROMPT = `## Memory System (memory-decay)

You have access to a decay-aware memory system. Use it actively:

- **memory_search**: Search your memories before responding to recall relevant context.
  Results include a "freshness" indicator (fresh/normal/stale) — treat stale memories with caution, they may be outdated.
- **memory_store**: Save important memories proactively — don't wait to be asked.
- **memory_store_batch**: Save multiple memories at once. More efficient than repeated memory_store calls.

### Category & Importance Guide

ALWAYS set the correct category and importance. Do NOT default everything to "fact" at 0.8.

| Category | When | Importance |
|----------|------|------------|
| preference | User's role, likes, style, workflow habits | 0.8-1.0 |
| decision | Why X was chosen, tradeoffs, rejected alternatives | 0.8-0.9 |
| fact | Technical facts, API behaviors, architecture | 0.7-0.9 |
| episode | What was worked on, session context | 0.3-0.6 |

### Store Proactively When:
- User reveals preferences, expertise, or communication style → preference (0.9)
- A technical choice is made with tradeoffs → decision (0.8)
- Non-obvious system behavior is discovered → fact (0.8)
- A feature or fix is completed → episode (0.5)

**IMPORTANT**: Do NOT write memory files to workspace/memory/ or any file path. Always use memory_store / memory_store_batch tools. They handle persistence, decay, and retrieval automatically.

Your memories naturally decay over time. Frequently recalled memories grow stronger; forgotten ones fade. This is by design.`;

const MIN_MESSAGE_LENGTH = 20;

const memoryDecayPlugin = {
  id: "memory-decay",
  name: "Memory Decay",
  description: "Human-like memory with decay and reinforcement",
  kind: "memory" as const,
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    const cfg = api.pluginConfig ?? {};
    const port = (cfg.serverPort as number) ?? 8100;
    const autoSave = cfg.autoSave !== false; // default true

    // Shared client — works as long as the server process is listening
    const client = new MemoryDecayClient(port);
    let service: MemoryDecayService | null = null;

    // --- Service ---
    api.registerService({
      id: "memory-decay-server",
      async start(ctx) {
        // Resolve embedding provider: config > env var > default
        const embeddingProvider =
          (cfg.embeddingProvider as string) ||
          process.env.MD_EMBEDDING_PROVIDER ||
          "local";

        // Resolve embedding model: config > env var
        const embeddingModel =
          (cfg.embeddingModel as string) ||
          process.env.MD_EMBEDDING_MODEL;

        // Resolve embedding API key: config > provider-specific env var > generic env var
        const embeddingApiKey =
          (cfg.embeddingApiKey as string) ||
          process.env.MD_EMBEDDING_API_KEY ||
          (embeddingProvider === "openai"
            ? process.env.OPENAI_API_KEY
            : embeddingProvider === "gemini"
              ? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
              : undefined);

        if (!embeddingApiKey && embeddingProvider !== "local") {
          ctx.logger.warn(
            `No API key found for embedding provider "${embeddingProvider}". ` +
            `Set MD_EMBEDDING_API_KEY or ${embeddingProvider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"} env var.`
          );
        }

        // Resolve memoryDecayPath: config > pip show memory-decay > error
        let memoryDecayPath = (cfg.memoryDecayPath as string) ?? "";
        if (!memoryDecayPath) {
          try {
            const { execSync } = await import("node:child_process");
            const location = execSync("pip show memory-decay 2>/dev/null | grep Location: | cut -d' ' -f2").toString().trim();
            if (location) memoryDecayPath = location;
          } catch {}
        }
        if (!memoryDecayPath) {
          ctx.logger.error(
            "Could not auto-detect memory-decay installation. " +
            "Run `pip install memory-decay` or set memoryDecayPath in plugin config."
          );
          return;
        }

        const config: ServiceConfig = {
          pythonPath: (cfg.pythonPath as string) ?? "python3",
          memoryDecayPath,
          port,
          dbPath: (cfg.dbPath as string) ?? "~/.openclaw/memory-decay-data/memories.db",
          embeddingProvider,
          embeddingModel,
          embeddingApiKey,
          embeddingDim: (cfg.embeddingDim as number) ??
            (process.env.MD_EMBEDDING_DIM ? parseInt(process.env.MD_EMBEDDING_DIM, 10) : undefined),
          experimentDir: cfg.experimentDir as string | undefined,
        };

        service = new MemoryDecayService(config);
        await service.start();
        ctx.logger.info("Server started");
      },
      async stop(ctx) {
        if (service) {
          await service.stop();
          ctx.logger.info("Server stopped");
        }
      },
    });

    // --- Tools ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyApi = api as any;

    anyApi.registerTool(
      (toolCtx: any) => ({
        label: "memory_search",
        name: "memory_search",
        description: "Search memories with decay-aware ranking. Returns results with freshness indicators.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query text" },
            top_k: { type: "number", description: "Max results (default 5)" },
          },
          required: ["query"],
        },
        async execute(toolCallId: string, params: Record<string, unknown>) {
          const res = await client.search({
            query: params.query as string,
            top_k: (params.top_k as number) ?? 5,
          });

          const enriched = res.results.map((r) => ({
            ...r,
            freshness: toFreshness(r.storage_score),
          }));

          return {
            content: [{ type: "text" as const, text: JSON.stringify(enriched, null, 2) }],
          };
        },
      }),
      { names: ["memory_search"] },
    );

    anyApi.registerTool(
      (toolCtx: any) => ({
        label: "memory_store",
        name: "memory_store",
        description: "Save an important memory. Use proactively for facts, preferences, decisions.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "The memory content to store" },
            importance: { type: "number", description: "0.0-1.0, default 0.8 for explicit saves" },
            category: { type: "string", description: "fact, episode, preference, decision" },
          },
          required: ["text"],
        },
        async execute(toolCallId: string, params: Record<string, unknown>) {
          const res = await client.store({
            text: params.text as string,
            importance: (params.importance as number) ?? 0.8,
            category: (params.category as string) ?? "fact",
            mtype: "fact",
          });

          return {
            content: [{ type: "text" as const, text: `Stored memory ${res.id}` }],
          };
        },
      }),
      { names: ["memory_store"] },
    );

    anyApi.registerTool(
      (toolCtx: any) => ({
        label: "memory_store_batch",
        name: "memory_store_batch",
        description:
          "Save multiple memories at once in a single request. More efficient than calling memory_store repeatedly. Each item can have its own importance and category.",
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "array",
              description: "Array of memories to store",
              items: {
                type: "object",
                properties: {
                  text: { type: "string", description: "The memory content to store" },
                  importance: { type: "number", description: "0.0-1.0, default 0.8" },
                  category: { type: "string", description: "fact, episode, preference, decision" },
                  mtype: { type: "string", description: "fact or episode, default fact" },
                },
                required: ["text"],
              },
            },
          },
          required: ["items"],
        },
        async execute(toolCallId: string, params: Record<string, unknown>) {
          const items = params.items as Array<Record<string, unknown>>;
          if (!items || items.length === 0) {
            return {
              content: [{ type: "text" as const, text: "No items provided" }],
            };
          }

          const storeItems = items.map((item) => ({
            text: item.text as string,
            importance: (item.importance as number) ?? 0.8,
            category: (item.category as string) ?? "fact",
            mtype: (item.mtype as string) ?? "fact",
          }));

          const res = await client.storeBatch(storeItems);

          return {
            content: [
              {
                type: "text" as const,
                text: `Stored ${res.count} memories: ${res.ids.join(", ")}`,
              },
            ],
          };
        },
      }),
      { names: ["memory_store_batch"] },
    );

    // --- Hooks ---

    // Bootstrap: inject memory instructions + apply time-based decay
    api.on("before_prompt_build", async (event, ctx) => {
      try {
        await client.autoTick();
      } catch {
        // Server might still be starting
      }

      return { prependSystemContext: BOOTSTRAP_PROMPT };
    });

    // Auto-save: store every conversation turn at low importance
    // Only active when autoSave is true (default); when disabled, the agent
    // is expected to use memory_store proactively instead.
    if (autoSave) {
      api.on("message_received", async (event, ctx) => {
        const content = event.content;
        if (!content || content.length < MIN_MESSAGE_LENGTH) return;

        try {
          await client.store({
            text: content,
            importance: 0.3,
            mtype: "episode",
            speaker: event.from ?? "user",
          });
        } catch (err) {
          api.logger.error(`Auto-save failed: ${err}`);
        }
      });
    }

    // Compaction: save session summary before context is compressed
    api.on("before_compaction", async (event, ctx) => {
      try {
        await client.store({
          text: `[Session summary] Compaction triggered. Topics discussed in this session.`,
          importance: 0.7,
          mtype: "episode",
        });
      } catch (err) {
        api.logger.error(`Compaction save failed: ${err}`);
      }
    });

    // Session end: apply time-based decay for elapsed time between sessions
    api.on("session_end", async (event, ctx) => {
      try {
        await client.autoTick();
      } catch (err) {
        api.logger.error(`Session-end tick failed: ${err}`);
      }
    });
  },
};

export default memoryDecayPlugin;

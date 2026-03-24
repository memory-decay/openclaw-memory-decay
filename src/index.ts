import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { MemoryDecayService, type ServiceConfig } from "./service.js";
import { toFreshness } from "./types.js";

const BOOTSTRAP_PROMPT = `## Memory System (memory-decay)

You have access to a decay-aware memory system. Use it actively:

- **memory_search**: Search your memories before responding to recall relevant context.
  Results include a "freshness" indicator (fresh/normal/stale) — treat stale memories with caution, they may be outdated.
- **memory_store**: Save important facts, user preferences, decisions, and commitments.
  Use this proactively — don't wait to be asked. If something seems worth remembering, store it.

Your memories naturally decay over time. Frequently recalled memories grow stronger; forgotten ones fade. This is by design.`;

const MIN_MESSAGE_LENGTH = 20;

const memoryDecayPlugin = {
  id: "memory-decay",
  name: "Memory Decay",
  description: "Human-like memory with decay and reinforcement",
  kind: "memory" as const,
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    let service: MemoryDecayService | null = null;

    // --- Service ---
    api.registerService({
      id: "memory-decay-server",
      async start(ctx) {
        const cfg = api.pluginConfig ?? {};
        const config: ServiceConfig = {
          pythonPath: (cfg.pythonPath as string) ?? "python3",
          memoryDecayPath: (cfg.memoryDecayPath as string) ?? "",
          port: (cfg.serverPort as number) ?? 8100,
          persistenceDir: (cfg.persistenceDir as string) ?? "~/.openclaw/memory-decay-data/",
        };

        if (!config.memoryDecayPath) {
          ctx.logger.error("memoryDecayPath is required in plugin config");
          return;
        }

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
    api.registerTool(
      (toolCtx) => ({
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
        async execute(params: Record<string, unknown>) {
          if (!service) throw new Error("Memory service not running");
          const client = service.getClient();

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

    api.registerTool(
      (toolCtx) => ({
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
        async execute(params: Record<string, unknown>) {
          if (!service) throw new Error("Memory service not running");
          const client = service.getClient();

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

    // --- Hooks ---

    // Bootstrap: inject memory instructions + apply time-based decay
    api.on("before_prompt_build", async (event, ctx) => {
      if (!service) return;
      const client = service.getClient();

      try {
        await client.autoTick();
      } catch {
        // Server might still be starting
      }

      return { prependSystemContext: BOOTSTRAP_PROMPT };
    });

    // Auto-save: store every conversation turn at low importance
    api.on("message_received", async (event, ctx) => {
      if (!service) return;

      const content = event.content;
      if (!content || content.length < MIN_MESSAGE_LENGTH) return;

      const client = service.getClient();
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

    // Compaction: save session summary before context is compressed
    api.on("before_compaction", async (event, ctx) => {
      if (!service) return;

      const client = service.getClient();
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
  },
};

export default memoryDecayPlugin;

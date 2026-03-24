import { definePluginEntry, type OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";
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

export default definePluginEntry({
  id: "memory-decay",
  name: "Memory Decay",
  description: "Human-like memory with decay and reinforcement",

  register(api: OpenClawPluginApi) {
    let service: MemoryDecayService | null = null;

    // --- Service ---
    api.registerService({
      id: "memory-decay-server",
      async start() {
        const cfg = api.getConfig() as Record<string, unknown>;
        const config: ServiceConfig = {
          pythonPath: (cfg.pythonPath as string) ?? "python3",
          memoryDecayPath: (cfg.memoryDecayPath as string) ?? "",
          port: (cfg.serverPort as number) ?? 8100,
          persistenceDir: (cfg.persistenceDir as string) ?? "~/.openclaw/memory-decay-data/",
        };

        if (!config.memoryDecayPath) {
          throw new Error("[memory-decay] memoryDecayPath is required in plugin config");
        }

        service = new MemoryDecayService(config);
        await service.start();
        console.log("[memory-decay] Server started");
      },
      async stop() {
        if (service) {
          await service.stop();
          console.log("[memory-decay] Server stopped");
        }
      },
    });

    // --- Tools ---
    api.registerTool({
      name: "memory_search",
      description: "Search memories with decay-aware ranking. Returns results with freshness indicators.",
      parameters: Type.Object({
        query: Type.String({ description: "Search query text" }),
        top_k: Type.Optional(Type.Number({ description: "Max results (default 5)", default: 5 })),
      }),
      async execute(_toolCallId: string, params: Record<string, unknown>) {
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
    });

    api.registerTool({
      name: "memory_store",
      description: "Save an important memory. Use proactively for facts, preferences, decisions.",
      parameters: Type.Object({
        text: Type.String({ description: "The memory content to store" }),
        importance: Type.Optional(Type.Number({ description: "0.0-1.0, default 0.8 for explicit saves" })),
        category: Type.Optional(Type.String({ description: "fact, episode, preference, decision" })),
        associations: Type.Optional(Type.Array(Type.String(), { description: "IDs of related memories" })),
      }),
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        if (!service) throw new Error("Memory service not running");
        const client = service.getClient();

        const res = await client.store({
          text: params.text as string,
          importance: (params.importance as number) ?? 0.8,
          category: (params.category as string) ?? "fact",
          mtype: "fact",
          associations: params.associations as string[] | undefined,
        });

        return {
          content: [{ type: "text" as const, text: `Stored memory ${res.id}` }],
        };
      },
    });

    // --- Hooks ---

    api.on("agent:bootstrap", async (event) => {
      if (!service) return;
      const client = service.getClient();

      try {
        await client.autoTick();
      } catch {
        // Server might still be starting
      }

      return { prependSystemContext: BOOTSTRAP_PROMPT };
    }, { name: "memory-decay-bootstrap" });

    api.on("message:received", async (event) => {
      if (!service) return;

      const content = event.context?.content as string | undefined;
      if (!content || content.length < MIN_MESSAGE_LENGTH) return;

      const client = service.getClient();
      try {
        await client.store({
          text: content,
          importance: 0.3,
          mtype: "episode",
          speaker: (event.context?.from as string) ?? "user",
        });
      } catch (err) {
        console.error("[memory-decay] Auto-save failed:", err);
      }
    }, { name: "memory-decay-auto-save" });

    api.on("before_compaction", async (event) => {
      if (!service) return;

      const client = service.getClient();
      try {
        await client.store({
          text: `[Session summary] Compaction triggered. Topics discussed in this session.`,
          importance: 0.7,
          mtype: "episode",
        });
      } catch (err) {
        console.error("[memory-decay] Compaction save failed:", err);
      }
    }, { name: "memory-decay-compaction" });
  },
});

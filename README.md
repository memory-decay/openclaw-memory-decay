![Memory Decay Banner](assets/banner.png)

# openclaw-memory-decay

**Give your OpenClaw a memory — one that forgets.**

An OpenClaw plugin that replaces flat file-based memory with a human-like decay system. Important things stick. Noise fades. Your agent remembers what matters without drowning in everything else.

Built on [memory-decay-core](https://github.com/memory-decay/memory-decay-core) — a mathematical memory model where activation decays over time, stability grows through recall, and retrieval consolidation reinforces what you actually use.

## Why

AI agents forget everything between sessions. The usual fix: dump everything into files and load it all back.

That works. Until it doesn't.

- 50 lines of memory → great. 500 lines → context pollution. 5000 lines → the agent stops attending to what matters.
- Everything is stored equally. A one-off joke about coffee has the same weight as your API architecture decisions.
- Retrieval is binary: either it's in the file or it isn't. No notion of "I think I remember this, but I'm not sure."

`openclaw-memory-decay` solves this with **decay**:

- Memories have an activation score that decreases over time — like human forgetting
- Important memories decay slower; trivial ones fade fast
- When your agent recalls a memory, it gets reinforced — the testing effect
- Search results come with freshness indicators: `fresh`, `normal`, `stale`
- The result: your agent naturally retains what matters and loses what doesn't

```
Activation
  1.0 ┤●
      │ ●●                                     ● (reinforced — recalled)
  0.8 ┤  ●●                                  ●●●
      │    ●●●●                            ●●
  0.6 ┤      ●●●●●●                    ●●●●
      │            ●●●●●●          ●●●●
  0.4 ┤                  ●●●●●●●●●●●
      │    ▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴▴
  0.2 ┤                                          (unreinforced — fading)
      │
  0.0 └─────────────────────────────────────────── Time
        ● saved at importance 0.9    ▴ saved at importance 0.3
```

## Features

- **Decay-aware search** — retrieval scores blend semantic similarity with activation and reinforcement history
- **Automatic noise cleanup** — low-importance memories decay naturally; no manual pruning
- **Retrieval consolidation** — memories get stronger every time they're recalled, modeling the testing effect
- **Category-aware storing** — the agent picks the right category (`preference`, `decision`, `fact`, `episode`) with calibrated importance (0.3–1.0), not a flat 0.8 for everything
- **Proactive agent saves** — the agent stores preferences, decisions, facts, and episodes without being asked
- **Freshness indicators** — search results include `fresh` / `normal` / `stale` so the agent can judge reliability
- **Dual-score model** — storage score (can it be found?) and retrieval score (how easily?) are tracked separately
- **`/remember` skill** — users can explicitly ask the agent to remember something
- **Markdown migration** — imports existing `~/.openclaw/workspace/memory/` files on first run

## Quick Start

```bash
# 1. Install memory-decay-core (the backend engine)
pip install memory-decay

# 2. Clone this plugin
git clone https://github.com/memory-decay/openclaw-memory-decay.git
cd openclaw-memory-decay

# 3. Install dependencies
npm install

# 4. Link the OpenClaw SDK (resolves plugin module imports)
npm run setup

# 5. Link as local plugin
openclaw plugins install -l .

# 6. (Optional but recommended) Restrict auto-load to trusted plugins only
openclaw config set plugins.allow '["memory-decay"]'

# 7. Restart the gateway
openclaw gateway restart
```

> **Note:** Steps 5 and 6 both succeed silently if the plugin is already loaded — use `openclaw plugins list` to confirm status is `loaded` and origin is `config`.

### Prerequisites

- [OpenClaw](https://openclaw.ai) installed globally
- Python 3.10+
- `memory-decay` Python package (`pip install memory-decay`)

## Configuration

Add to `~/.openclaw/openclaw.json` under `plugins.entries.memory-decay.config`:

```json
{
  "plugins": {
    "entries": {
      "memory-decay": {
        "enabled": true,
        "config": {
          "dbPath": "~/.openclaw/memory-decay-data/memories.db",
          "serverPort": 8100,
          "autoSave": false
        }
      }
    }
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `serverPort` | `8100` | Port for the memory-decay HTTP server |
| `memoryDecayPath` | (auto) | Path to memory-decay-core. Auto-detected from `pip show memory-decay` if not set |
| `pythonPath` | `python3` | Path to Python interpreter (use your venv) |
| `dbPath` | `~/.openclaw/memory-decay-data/memories.db` | SQLite database location |
| `autoSave` | `true` | Auto-save every conversation turn at low importance. Set `false` to let the agent decide what to save |
| `embeddingProvider` | `local` | Embedding provider: `local`, `openai`, or `gemini` |
| `embeddingApiKey` | (auto) | API key for embedding provider. Falls back to env vars (see below) |
| `embeddingModel` | (auto) | Specific embedding model name |
| `embeddingDim` | (auto) | Embedding dimension (auto-detected from provider) |

### API Key Configuration

The API key for embedding providers is resolved in this order:

1. **Plugin config** — `embeddingApiKey` in `openclaw.json`
2. **Generic env var** — `MD_EMBEDDING_API_KEY`
3. **Provider-specific env var** — `OPENAI_API_KEY` (openai) or `GEMINI_API_KEY` / `GOOGLE_API_KEY` (gemini)

```bash
# Example: use OpenAI embeddings with API key from environment
export OPENAI_API_KEY="sk-..."

# Or use the generic variable (works with any provider)
export MD_EMBEDDING_API_KEY="sk-..."
```

When using the `local` provider (default), no API key is needed — embeddings are computed locally using sentence-transformers.

### autoSave: true vs false

| Mode | Who stores | When | Importance |
|------|-----------|------|------------|
| `autoSave: true` | Plugin automatically | Every conversation turn | 0.3 (low) |
| `autoSave: false` | Agent decides | When something is worth remembering | 0.8 (high, set by agent) |

With `autoSave: false`, the agent uses `memory_store` proactively — storing facts, decisions, preferences, and important context. Noise stays out of the memory system entirely.

## Memory Categories

The bootstrap prompt and skills guide the agent to pick the right category and importance:

| Category | When | Importance | Example |
|----------|------|------------|---------|
| `preference` | User's role, style, habits, likes/dislikes | 0.8–1.0 | "User prefers Korean for conversation, English for code" |
| `decision` | Why X was chosen, tradeoffs, rejected alternatives | 0.8–0.9 | "Chose SQLite over Postgres — single-node, no ops overhead" |
| `fact` | Technical facts, API behaviors, architecture | 0.7–0.9 | "Auth service returns inconsistent 4xx on token expiry" |
| `episode` | What was worked on, session context | 0.3–0.6 | "Finished migrating auth middleware" |

The agent stores proactively based on conversation triggers — it doesn't wait for `/remember`.

## How It Works

```
┌──────────────┐         ┌──────────────────┐         ┌────────────────────┐
│  OpenClaw    │ ◄─────► │  Plugin (TS)     │ ◄─────► │  memory-decay-core │
│  Agent       │  tools  │  Hook handler    │   HTTP  │  (Python/FastAPI)  │
│              │         │                  │  :8100  │                    │
└──────────────┘         └──────────────────┘         └────────────────────┘
                               │                              │
                               │ session_end                  │ POST /auto-tick
                               │ ──────────────►              │
                               │                              │
                               │ message_received             │ POST /store
                               │ (if autoSave)                │
                               │ ──────────────►              │
                               │                              │
                               │ before_compaction            │ POST /store
                               │                              │
```

The plugin manages the Python server lifecycle — starts with the gateway, stops on shutdown.

### Memory Lifecycle

```
  Store ──► Activate ──► Decay ──► Search ──► Reinforce ──► Decay (slower)
    │                        │                         │
    │                        │                         └──► Stability increases
    │                        │
    │                        └──► Low importance fades fast
    │                             High importance fades slow
    │
    └──► Importance set by agent (0.8) or auto-save (0.3)
```

1. **Store** — memory enters with an activation of 1.0 and a set importance
2. **Decay** — each tick, activation decreases based on importance and stability
3. **Search** — semantic similarity × activation weighting × BM25 re-ranking
4. **Reinforce** — recalled memories get boosted (testing effect), stability grows
5. **Forget** — memories with very low activation become practically unretrievable

## Skills

The plugin registers these skills:

| Skill | Trigger | Description |
|-------|---------|-------------|
| `/remember` | `/remember I prefer dark mode` | Save with correct category and calibrated importance |
| `/recall` | `/recall what did we decide about the API?` | Search memories with freshness-aware action guidance |
| `/forget` | `/forget the temp password` | Delete a specific memory |
| `/memory-status` | `/memory-status` | Show memory count, tick, and decay stats |
| `/migrate` | `/migrate` | Import Markdown files from `memory/` directory |

## Troubleshooting

### `plugins.allow is empty; discovered non-bundled plugins may auto-load`

This warning appears when `plugins.allow` is not set. While the plugin still loads (since it is explicitly configured in `plugins.entries`), it is good practice to restrict auto-load to trusted plugins only:

```bash
openclaw config set plugins.allow '["memory-decay"]'
openclaw gateway restart
```

### `Cannot find module 'openclaw/plugin-sdk'`

```bash
npm run setup
```

### `Memory service not running`

```bash
# Check if memory-decay is installed
pip show memory-decay

# Check server health
curl http://127.0.0.1:8100/health
```

If `pip show memory-decay` returns nothing, install it:
```bash
pip install memory-decay
```

### Plugin shows `error` status

```bash
openclaw plugins doctor
```

## License

MIT

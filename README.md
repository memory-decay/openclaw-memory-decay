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
- **Proactive agent saves** — the agent stores important facts, decisions, and preferences at high importance via `memory_store`
- **Freshness indicators** — search results include `fresh` / `normal` / `stale` so the agent can judge reliability
- **Dual-score model** — storage score (can it be found?) and retrieval score (how easily?) are tracked separately
- **`/remember` skill** — users can explicitly ask the agent to remember something
- **Markdown migration** — imports existing `~/.openclaw/workspace/memory/` files on first run

## Quick Start

```bash
# 1. Clone
git clone https://github.com/tmdgusya/openclaw-memory-decay.git
cd openclaw-memory-decay

# 2. Install
npm install

# 3. Link the OpenClaw SDK (resolves plugin module imports)
npm run setup

# 4. Install as OpenClaw plugin
openclaw plugins install -l .

# 5. Restart the gateway
openclaw gateway restart
```

### Prerequisites

- [OpenClaw](https://openclaw.ai) installed globally
- [memory-decay-core](https://github.com/memory-decay/memory-decay-core) with Python dependencies installed
- Python 3.10+

## Configuration

Add to `~/.openclaw/openclaw.json` under `plugins.entries.memory-decay.config`:

```json
{
  "plugins": {
    "entries": {
      "memory-decay": {
        "enabled": true,
        "config": {
          "memoryDecayPath": "/path/to/memory-decay-core",
          "dbPath": "~/.openclaw/memory-decay-data/memories.db",
          "serverPort": 8100,
          "pythonPath": "/path/to/.venv/bin/python3",
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
| `pythonPath` | `python3` | Path to Python interpreter (use your venv) |
| `memoryDecayPath` | (required) | Path to memory-decay-core |
| `dbPath` | `~/.openclaw/memory-decay-data/memories.db` | SQLite database location |
| `autoSave` | `true` | Auto-save every conversation turn at low importance. Set `false` to let the agent decide what to save |

### autoSave: true vs false

| Mode | Who stores | When | Importance |
|------|-----------|------|------------|
| `autoSave: true` | Plugin automatically | Every conversation turn | 0.3 (low) |
| `autoSave: false` | Agent decides | When something is worth remembering | 0.8 (high, set by agent) |

With `autoSave: false`, the agent uses `memory_store` proactively — storing facts, decisions, preferences, and important context. Noise stays out of the memory system entirely.

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
| `/remember` | `/remember I prefer dark mode` | Explicitly save something at importance 0.9 |
| `/recall` | `/recall what did we decide about the API?` | Search memories and summarize |
| `/forget` | `/forget the temp password` | Delete a specific memory |
| `/memory-status` | `/memory-status` | Show memory count, tick, and decay stats |
| `/migrate` | `/migrate` | Import Markdown files from `memory/` directory |

## Troubleshooting

### `Cannot find module 'openclaw/plugin-sdk'`

```bash
npm run setup
```

### `Memory service not running`

```bash
curl http://127.0.0.1:8100/health
```

Check `memoryDecayPath` points to a valid memory-decay-core repo and `pythonPath` hits a venv with dependencies installed.

### Plugin shows `error` status

```bash
openclaw plugins doctor
```

## License

MIT

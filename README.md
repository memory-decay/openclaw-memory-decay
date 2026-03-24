# openclaw-memory-decay

OpenClaw memory plugin backed by [memory-decay](https://github.com/tmdgusya/memory-decay) — human-like memory with decay and reinforcement.

Replaces the default `memory-core` plugin with a decay-aware memory system where frequently recalled memories grow stronger and forgotten ones naturally fade.

## Features

- **Decay-aware search** — retrieval scores factor in recency, importance, and reinforcement history
- **Automatic conversation storage** — every turn is saved at low importance; decay handles cleanup
- **Explicit memory saves** — agent proactively stores important facts at high importance via `memory_store` tool
- **Freshness indicators** — search results include `fresh`/`normal`/`stale` so the agent can judge reliability
- **Migration** — imports existing Markdown memories from `~/.openclaw/workspace/memory/` on first run
- **`/remember` skill** — users can explicitly ask the agent to remember something

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/tmdgusya/openclaw-memory-decay.git
cd openclaw-memory-decay

# 2. Install dependencies
npm install

# 3. Install as OpenClaw plugin
openclaw plugins install /path/to/openclaw-memory-decay

# 4. Enable the plugin and set it as memory backend
openclaw plugins enable memory-decay
```

## Configuration

After installation, configure the plugin in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "slots": {
      "memory": "memory-decay"
    },
    "entries": {
      "memory-decay": {
        "enabled": true,
        "config": {
          "memoryDecayPath": "/path/to/memory-decay",
          "persistenceDir": "~/.openclaw/memory-decay-data/"
        }
      }
    }
  }
}
```

### Config Options

| Option | Default | Description |
|--------|---------|-------------|
| `serverPort` | `8100` | Port for the memory-decay HTTP server |
| `pythonPath` | `python3` | Path to Python interpreter |
| `memoryDecayPath` | (required) | Path to the [memory-decay](https://github.com/tmdgusya/memory-decay) repository |
| `persistenceDir` | `~/.openclaw/memory-decay-data/` | Where memory graph state is persisted |
| `autoSave` | `true` | Auto-save conversation turns at low importance |

## Prerequisites

- [memory-decay](https://github.com/tmdgusya/memory-decay) cloned and dependencies installed
- Python 3.10+
- OpenClaw gateway running

## How It Works

```
OpenClaw Agent ←→ Plugin (TypeScript) ←→ memory-decay server (Python/FastAPI)
```

### Two-Layer Memory Storage

| Layer | Trigger | Importance | Decay Rate |
|-------|---------|------------|------------|
| Auto-save | Every conversation turn | 0.3 (low) | Fast — fades unless reinforced |
| Agent-save | Agent uses `memory_store` | 0.8 (high) | Slow — persists long-term |
| User-save | `/remember` skill | 0.9 (very high) | Very slow |
| Compaction | Before context compaction | 0.7 | Moderate |

### Decay Behavior

- Low-importance auto-saved conversations decay quickly, acting as a safety net
- Agent-initiated saves persist because high importance slows decay
- Every `memory_search` hit reinforces matched memories, making them last longer
- The result: important information survives; noise fades naturally

## License

MIT

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

## Prerequisites

- [OpenClaw](https://openclaw.ai) installed globally (`npm i -g openclaw`)
- [memory-decay](https://github.com/tmdgusya/memory-decay) cloned and Python dependencies installed
- Python 3.9+

## Installation

```bash
# 1. Clone this repository
git clone https://github.com/tmdgusya/openclaw-memory-decay.git
cd openclaw-memory-decay

# 2. Install dependencies
npm install

# 3. Link the OpenClaw SDK (required for module resolution)
npm run setup

# 4. Install as OpenClaw plugin (link mode)
openclaw plugins install -l .

# 5. Restart the gateway
openclaw gateway restart
```

> **Why `npm run setup`?**
> External OpenClaw plugins need to resolve `openclaw/plugin-sdk` at load time.
> Stock plugins resolve this automatically (they live inside the openclaw package),
> but link-mode plugins need a symlink from `node_modules/openclaw` to the global
> installation. The setup script creates this symlink.

## Configuration

After installation, add `config` to the plugin entry in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "memory-decay": {
        "enabled": true,
        "config": {
          "memoryDecayPath": "/path/to/memory-decay",
          "persistenceDir": "~/.openclaw/memory-decay-data/",
          "serverPort": 8300
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

## How It Works

```
OpenClaw Agent <-> Plugin (TypeScript) <-> memory-decay server (Python/FastAPI)
```

The plugin manages the Python server lifecycle automatically — it starts when the gateway starts and stops when it shuts down.

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

## Troubleshooting

### `Cannot find module 'openclaw/plugin-sdk'`

Run `npm run setup` to link the OpenClaw SDK. If that fails, manually create the symlink:

```bash
ln -s "$(npm root -g)/openclaw" node_modules/openclaw
```

### `Memory service not running`

Check the server is running: `curl http://127.0.0.1:8300/health`

If not, verify `memoryDecayPath` in your config points to a valid memory-decay repo with Python dependencies installed.

### Plugin shows `error` status

Run `openclaw plugins doctor` to see the error details.

## License

MIT

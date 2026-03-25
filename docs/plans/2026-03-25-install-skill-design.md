# Install Skill Design

## Overview

ClawHub skill (`memory-decay-install`) that allows non-developers to install the full memory-decay stack with a single command: `/install-memory-decay`.

## Install Flow

1. **Pre-check**: uv, git availability. Auto-install uv if missing. Auto-install Python 3.10+ via `uv python install` if needed.
2. **Clone repos** to `~/.openclaw/plugins/memory-decay/`:
   - `openclaw-memory-decay` (TypeScript plugin)
   - `memory-decay-core` (Python backend)
3. **Backend setup**: `uv venv` + `uv pip install -e .` in memory-decay-core
4. **Plugin setup**: `npm install` + `npm run setup` + `openclaw plugins install -l .`
5. **User config prompt**: embedding provider (openai/gemini/local), API key, port (default 8300), autoSave (default false)
6. **Write config** to `openclaw.json`
7. **Restart gateway** + health check

## Embedding Providers

| Provider | API Key Required | Default Model | Dimension |
|----------|-----------------|---------------|-----------|
| `openai` | Yes | `text-embedding-3-small` | configurable |
| `gemini` | Yes | `gemini-embedding-001` | 768 |
| `local`  | No  | `jhgan/ko-sroberta-multitask` | 768 |

## File Structure

```
memory-decay-install/
├── SKILL.md          # Agent-facing install recipe
└── scripts/
    └── install.sh    # Core automation script
```

## Install Path

Default: `~/.openclaw/plugins/memory-decay/`
User can override if desired.

## Error Handling

- Clone failure → network/permissions guidance
- Python < 3.10 → auto-install via uv
- Health check failure → log check guidance
- Already installed → update/reinstall choice

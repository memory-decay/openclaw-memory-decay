---
name: install-memory-decay
description: Install and configure the memory-decay plugin for OpenClaw. Use when the user says "install memory-decay", "setup memory", "메모리 설치", "memory-decay 설치", or wants to add human-like memory with decay to their OpenClaw agent.
---

# Install Memory Decay

This skill installs the full memory-decay stack: the OpenClaw plugin (TypeScript) and the memory-decay-core backend (Python).

## Step 1: Ask the user for configuration

Before running the installer, ask the user these questions **one at a time**:

### Embedding Provider

Ask: "Which embedding provider would you like to use?"

| Provider | API Key Required | Notes |
|----------|-----------------|-------|
| `openai` | Yes | Best quality. Requires OpenAI API key. Default model: `text-embedding-3-small` |
| `gemini` | Yes | Free tier available. Requires Google AI API key. Default model: `gemini-embedding-001` |
| `local`  | No  | Runs locally via sentence-transformers. No API key needed but slower and uses more RAM |

### API Key (if openai or gemini)

Ask: "Please provide your [OpenAI/Gemini] API key."

### Optional: Custom settings

Only ask if the user seems technical or asks for more options:
- **Port** (default: 8300)
- **Auto-save** (default: false — the agent decides what to remember)
- **Install directory** (default: `~/.openclaw/plugins/memory-decay`)
- **Embedding model** (only if they want to override the default)

## Step 2: Run the installer

Build the command from the user's answers and run it:

```bash
bash "${SKILL_DIR}/scripts/install.sh" \
  --provider <provider> \
  --api-key <key> \
  [--model <model>] \
  [--port <port>] \
  [--auto-save <true|false>] \
  [--install-dir <path>]
```

Where `${SKILL_DIR}` is the directory containing this SKILL.md file.

**Example for OpenAI:**
```bash
bash "${SKILL_DIR}/scripts/install.sh" --provider openai --api-key sk-xxxxx
```

**Example for local (no key):**
```bash
bash "${SKILL_DIR}/scripts/install.sh" --provider local
```

## Step 3: Verify and explain

After the script completes successfully, tell the user:

1. Memory-decay is now active
2. The agent will automatically remember important information (decisions, preferences, facts)
3. Available commands:
   - `/remember <something>` — explicitly save something important
   - `/recall <query>` — search memories
   - `/forget <query>` — delete a specific memory
   - `/memory-status` — check memory stats

If the script fails, check the error output and help the user troubleshoot:
- **uv install failed** → suggest manual install: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **clone failed** → check network/GitHub access
- **health check failed** → run `openclaw channels logs` and check for Python errors
- **npm install failed** → check Node.js version (18+ required)

## Step 4: Already installed?

If the user already has memory-decay installed and runs this skill again, the script will:
- Pull latest changes from both repos
- Re-install dependencies
- Update configuration
- Restart the gateway

This is safe to run multiple times.

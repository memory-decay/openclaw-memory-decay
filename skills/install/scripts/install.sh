#!/usr/bin/env bash
set -euo pipefail

# ── memory-decay installer ──────────────────────────────────────────
# Usage:
#   bash install.sh \
#     --provider openai \
#     --api-key sk-xxx \
#     [--model text-embedding-3-large] \
#     [--port 8300] \
#     [--auto-save false] \
#     [--install-dir ~/.openclaw/plugins/memory-decay]
# ────────────────────────────────────────────────────────────────────

INSTALL_DIR="${HOME}/.openclaw/plugins/memory-decay"
PROVIDER="local"
API_KEY=""
MODEL=""
PORT=8300
AUTO_SAVE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider)     PROVIDER="$2"; shift 2 ;;
    --api-key)      API_KEY="$2"; shift 2 ;;
    --model)        MODEL="$2"; shift 2 ;;
    --port)         PORT="$2"; shift 2 ;;
    --auto-save)    AUTO_SAVE="$2"; shift 2 ;;
    --install-dir)  INSTALL_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

info()  { echo "▸ $*"; }
ok()    { echo "✓ $*"; }
fail()  { echo "✗ $*" >&2; exit 1; }

# ── 1. Pre-checks ──────────────────────────────────────────────────

info "Checking prerequisites..."

# git
command -v git >/dev/null 2>&1 || fail "git is required but not found. Please install git first."

# node / npm
command -v node >/dev/null 2>&1 || fail "Node.js is required but not found. Please install Node.js first."
command -v npm  >/dev/null 2>&1 || fail "npm is required but not found."

# openclaw
command -v openclaw >/dev/null 2>&1 || fail "OpenClaw is required but not found. Install from https://openclaw.ai"

# uv — auto-install if missing
if ! command -v uv >/dev/null 2>&1; then
  info "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="${HOME}/.local/bin:${PATH}"
  command -v uv >/dev/null 2>&1 || fail "uv installation failed."
  ok "uv installed"
else
  ok "uv found"
fi

# Python 3.10+ — auto-install via uv if needed
PYTHON_OK=false
for py in python3.13 python3.12 python3.11 python3.10; do
  if command -v "$py" >/dev/null 2>&1; then
    PYTHON_CMD="$py"
    PYTHON_OK=true
    break
  fi
done

if ! $PYTHON_OK; then
  info "Python 3.10+ not found. Installing via uv..."
  uv python install 3.13
  PYTHON_CMD="$(uv python find 3.13)"
  [[ -n "$PYTHON_CMD" ]] || fail "Python installation failed."
  ok "Python 3.13 installed"
else
  ok "Python found: $PYTHON_CMD"
fi

ok "All prerequisites met"

# ── 2. Clone repositories ──────────────────────────────────────────

mkdir -p "$INSTALL_DIR"

PLUGIN_DIR="${INSTALL_DIR}/openclaw-memory-decay"
CORE_DIR="${INSTALL_DIR}/memory-decay-core"

if [[ -d "$PLUGIN_DIR/.git" ]]; then
  info "Plugin repo exists, pulling latest..."
  git -C "$PLUGIN_DIR" pull --ff-only || true
else
  info "Cloning openclaw-memory-decay..."
  git clone https://github.com/memory-decay/openclaw-memory-decay.git "$PLUGIN_DIR" \
    || fail "Failed to clone openclaw-memory-decay. Check network access and that the repo is accessible."
fi
ok "Plugin repo ready"

if [[ -d "$CORE_DIR/.git" ]]; then
  info "Core repo exists, pulling latest..."
  git -C "$CORE_DIR" pull --ff-only || true
else
  info "Cloning memory-decay-core..."
  git clone https://github.com/memory-decay/memory-decay-core.git "$CORE_DIR" \
    || fail "Failed to clone memory-decay-core. Check network access and that the repo is accessible."
fi
ok "Core repo ready"

# ── 3. Backend setup (Python / uv) ─────────────────────────────────

info "Setting up Python backend..."
cd "$CORE_DIR"

if [[ ! -d ".venv" ]]; then
  uv venv --python "$PYTHON_CMD"
fi
uv pip install -e ".[dev]"
VENV_PYTHON="${CORE_DIR}/.venv/bin/python3"
ok "Python backend ready"

# ── 4. Plugin setup (Node) ─────────────────────────────────────────

info "Setting up OpenClaw plugin..."
cd "$PLUGIN_DIR"
npm install --no-fund --no-audit
npm run setup
openclaw plugins install -l .
ok "Plugin registered"

# ── 5. Configure openclaw.json ──────────────────────────────────────

info "Writing configuration..."

openclaw config set plugins.entries.memory-decay.enabled true
openclaw config set plugins.entries.memory-decay.config.memoryDecayPath "$CORE_DIR"
openclaw config set plugins.entries.memory-decay.config.pythonPath "$VENV_PYTHON"
openclaw config set plugins.entries.memory-decay.config.serverPort "$PORT"
openclaw config set plugins.entries.memory-decay.config.autoSave "$AUTO_SAVE"
openclaw config set plugins.entries.memory-decay.config.embeddingProvider "$PROVIDER"
openclaw config set plugins.slots.memory memory-decay

if [[ -n "$API_KEY" ]]; then
  openclaw config set plugins.entries.memory-decay.config.embeddingApiKey "$API_KEY"
fi

if [[ -n "$MODEL" ]]; then
  openclaw config set plugins.entries.memory-decay.config.embeddingModel "$MODEL"
fi

ok "Configuration written"

# ── 6. Restart & verify ────────────────────────────────────────────

info "Restarting gateway..."
openclaw gateway restart

info "Waiting for memory-decay server..."
for i in $(seq 1 20); do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    ok "Memory-decay server is healthy!"
    echo ""
    echo "═══════════════════════════════════════════════"
    echo "  memory-decay installed successfully!"
    echo ""
    echo "  Provider : ${PROVIDER}"
    echo "  Port     : ${PORT}"
    echo "  Auto-save: ${AUTO_SAVE}"
    echo "  Path     : ${INSTALL_DIR}"
    echo "═══════════════════════════════════════════════"
    exit 0
  fi
  sleep 2
done

fail "Server health check failed after 40s. Check logs with: openclaw channels logs"

# Integration test image for openclaw-memory-decay
# Build context: parent workspace directory (..)
#
# Usage:
#   docker build -t memory-decay-test -f Dockerfile ..
#   docker run --rm memory-decay-test

FROM python:3.13-slim AS base

# System deps (build-essential for sqlite-vec C extension, curl for Node)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl build-essential && \
    rm -rf /var/lib/apt/lists/*

# Node 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# --- Python backend ---
COPY memory-decay/pyproject.toml /app/memory-decay/pyproject.toml
COPY memory-decay/src/ /app/memory-decay/src/
COPY memory-decay/experiments/ /app/memory-decay/experiments/

WORKDIR /app/memory-decay
RUN pip install --no-cache-dir -e .

# Pre-download embedding model so tests don't timeout on model fetch
RUN python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('jhgan/ko-sroberta-multitask')"

# --- Node plugin ---
COPY openclaw-memory-decay/package.json openclaw-memory-decay/package-lock.json /app/openclaw-memory-decay/
WORKDIR /app/openclaw-memory-decay
RUN npm ci --ignore-scripts

COPY openclaw-memory-decay/src/ /app/openclaw-memory-decay/src/
COPY openclaw-memory-decay/tsconfig.json /app/openclaw-memory-decay/
RUN npx tsc

COPY openclaw-memory-decay/test/ /app/openclaw-memory-decay/test/

# --- Run integration tests ---
CMD ["sh", "-c", "node --test test/integration/*.test.mjs"]

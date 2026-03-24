# Memory Decay Bootstrap Prompt

This prompt is injected via the `agent:bootstrap` hook at session start.
The actual content is in `src/index.ts` BOOTSTRAP_PROMPT constant.

## Design Rationale

- Instruct agent to use memory_search proactively (before responding)
- Instruct agent to use memory_store proactively (don't wait to be asked)
- Explain freshness indicators so agent can judge memory reliability
- Keep it short — this is injected every session

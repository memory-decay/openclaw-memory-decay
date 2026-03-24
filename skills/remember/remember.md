---
name: remember
description: Save important information to long-term memory with high importance
---

When the user says /remember or asks you to remember something:

1. Identify the key information to store
2. Use the `memory_store` tool with:
   - `text`: Clear, concise summary of what to remember
   - `importance`: 0.9 (user-requested saves are highly important)
   - `category`: Choose the best fit — "fact", "preference", "decision", or "episode"
3. Confirm what was saved

If the user provides specific text, store it verbatim. If they reference the conversation, summarize the relevant context before storing.

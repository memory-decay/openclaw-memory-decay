---
name: recall
description: Search and recall memories from long-term memory with decay-aware ranking
---

When the user says /recall or asks to recall/find something from memory:

1. Use the `memory_search` tool with the user's query
   - Default `top_k`: 5, increase to 10 if the user asks for "everything" or "all"
2. Present results clearly:
   - Show the memory content and category
   - Indicate freshness with action guidance:
     - **fresh** → reliable, act on it confidently
     - **normal** → likely accurate, verify if the decision is consequential
     - **stale** → may be outdated, verify before acting or warn the user
   - Show the relevance score
3. If results are stale, warn the user that the information may have changed

If no results are found, say so honestly — don't fabricate memories.

## Proactive Recall

Don't wait for /recall. Search memories automatically when:
- A question might have been discussed before
- Starting work on a topic that might have history
- Making a decision that might have prior context
- You should adapt your response to user preferences

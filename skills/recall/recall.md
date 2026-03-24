---
name: recall
description: Search and recall memories from long-term memory with decay-aware ranking
---

When the user says /recall or asks to recall/find something from memory:

1. Use the `memory_search` tool with the user's query
   - Default `top_k`: 5, increase to 10 if the user asks for "everything" or "all"
2. Present results clearly:
   - Show the memory content
   - Indicate freshness: fresh (reliable), normal (likely accurate), stale (may be outdated — verify before acting)
   - Show the relevance score
3. If results are stale, warn the user that the information may have changed

If no results are found, say so honestly — don't fabricate memories.

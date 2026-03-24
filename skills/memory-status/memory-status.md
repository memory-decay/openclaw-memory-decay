---
name: memory-status
description: Show memory system status — count, health, and decay statistics
---

When the user says /memory-status or asks about memory system health:

1. Check the memory-decay server health endpoint
2. Report:
   - Total number of stored memories
   - Current tick (time progression)
   - Server status (healthy/unhealthy)
3. Optionally, search for recent memories to give a sense of what's been stored

Keep the report concise — a few lines is enough.

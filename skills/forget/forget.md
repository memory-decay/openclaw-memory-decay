---
name: forget
description: Explicitly forget or delete a specific memory
---

When the user says /forget or asks to forget/delete something:

1. First, use `memory_search` to find the memory the user wants to forget
2. Show the matching results and ask the user to confirm which one to delete
3. Once confirmed, call the memory-decay server's DELETE endpoint to remove it:
   - Use the memory ID from the search result
4. Confirm deletion to the user

Never delete memories without user confirmation. If multiple results match, list them and ask which one(s) to remove.

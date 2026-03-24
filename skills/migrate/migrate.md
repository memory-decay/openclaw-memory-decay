---
description: Migrate existing Markdown memories from workspace/memory/ into the memory-decay system
user-invocable: true
---

# Migrate Memories

Import existing Markdown memory files from `~/.openclaw/workspace/memory/` into the memory-decay engine.

## Steps

1. List files in `~/.openclaw/workspace/memory/` to show the user what will be migrated
2. Ask the user to confirm before proceeding
3. For each `.md` file:
   - Read the file content
   - Split into logical sections (by headings or paragraphs)
   - Use `memory_store` to save each section with appropriate importance:
     - MEMORY.md or curated files: importance 0.7
     - Date-based files (YYYY-MM-DD.md): importance 0.4
     - Other files: importance 0.5
4. Report the total number of memories migrated

## Important

- Skip sections shorter than 10 characters
- For large sections (>500 chars), split by paragraphs
- This is a one-time operation. After migration, the agent should use `memory_store` for all new memories.

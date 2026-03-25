---
name: remember
description: Save important information to long-term memory with correct category and calibrated importance
---

When the user says /remember or asks you to remember something:

1. Identify the key information to store
2. **Pick the correct category and importance** using this guide:

| Category | When to use | Importance |
|----------|-------------|------------|
| `preference` | User's likes, dislikes, style, workflow habits, communication preferences | 0.8-1.0 |
| `decision` | Why something was done a certain way, tradeoffs, rejected alternatives | 0.8-0.9 |
| `fact` | Technical facts, API behaviors, architecture patterns, domain knowledge | 0.7-0.9 |
| `episode` | What was worked on, session context, transient events | 0.3-0.6 |

3. Use the `memory_store` tool with:
   - `text`: Clear, concise summary of what to remember
   - `importance`: Calibrated per the table above (user-explicit requests get +0.1 bump)
   - `category`: The best-fit category — do NOT default to "fact" for everything
4. Confirm what was saved, including the category used

If the user provides specific text, store it verbatim. If they reference the conversation, summarize the relevant context before storing.

## Proactive Storing

Don't wait for /remember. Store proactively when:
- User reveals their role, expertise, or preferences → `preference`
- A technical choice is made with tradeoffs → `decision`
- You discover a non-obvious system behavior → `fact`
- A feature/fix is completed → `episode`

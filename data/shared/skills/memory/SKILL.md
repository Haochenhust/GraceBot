---
name: memory
description: Remember important facts and preferences for the user and recall them in later conversations.
---

# Memory

When the user says to remember something, or when the conversation reveals a lasting fact or preference, use the `memory_write` tool. When answering questions that might depend on past context, use `memory_read` or rely on the "Relevant memories" section in your context.

## When to write
- The user explicitly says "remember this", "记住", or similar.
- A clear preference, fact, or constraint is stated (e.g. role, stack, constraints).
- A one-off detail that won’t matter later: usually don’t store it.

## When to read
- The user asks "do you remember…", "你还记得…", or refers to something from the past.
- Your context already includes "Relevant memories"; use them in your answer.

## Guidelines
- Use a clear, concise phrase for the content.
- Choose the right category: preference, fact, event, or skill.
- Set importance (1–10) by how often it should influence future replies.

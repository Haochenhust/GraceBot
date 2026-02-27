---
name: exec
description: Run shell commands in the user workspace for listing files, running scripts, or system checks.
---

# Exec (shell commands)

When the user wants to run a command, list files, or run a script, use the `exec` tool.

## When to use
- "List files", "run ls", "what's in this directory"
- "Run this script", "execute the tests"
- "Check if X is installed", "run a one-off command"

## Guidelines
- Prefer the user’s workspace as the working directory unless they say otherwise.
- If the command fails, report the error clearly and suggest fixes when you can.
- Don’t run destructive or system-wide commands without the user clearly asking for them.

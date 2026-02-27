---
name: coding
description: Write, edit, and review code with clear structure and tests.
---

# Coding

When the user asks for code or code changes, follow these rules.

## Code style
- Prefer a functional style where it fits.
- Use camelCase for variables and functions.
- Keep each function under about 30 lines.

## Workflow
1. Understand the request; ask for clarification if needed.
2. Design interfaces or APIs first, then implement.
3. After writing code, run tests with the `exec` tool when appropriate.

## Don’t
- Don’t generate single files longer than about 200 lines.
- Don’t use `any` in TypeScript; use proper types.

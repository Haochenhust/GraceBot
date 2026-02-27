# LLM content language principle

**All content that is sent to the model must be written in English.**

This applies to:

- **System prompt** (including identity, instructions, and any built-in sections)
- **SOUL.md** (persona / personality)
- **Skills** (all `*.md` under skills)
- **USER.md** (user profile)
- **Memory** entries (content stored and later injected into context)
- **Profiles** and any other text that is concatenated into the prompt

Rationale: keep a single language in the model context for consistency and better behavior. User-facing replies can still be in Chinese (or any language) depending on SOUL/locale settings.

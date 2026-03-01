import { createLogger } from "../shared/logger.js";
import { readTextFile, writeTextFile } from "../shared/utils.js";
import type { AgentResult, UnifiedMessage } from "../shared/types.js";
import type { ModelRouter } from "../agents/model-router.js";

const log = createLogger("user-profile");

const PROFILE_ANALYSIS_PROMPT = `You are a user profile maintenance assistant. You must maintain USER.md by adding, deleting, or modifying items—not only appending.

Rules:
- Output the **complete revised** user profile as a single Markdown document.
- Start with a "# User Profile" heading and an optional short note (e.g. "Not yet fully established; will be refined through conversation").
- Use a bullet list (- item) for each trait. Use English only.
- **Add**: new traits inferred from the recent exchange.
- **Delete**: outdated, wrong, or redundant items.
- **Modify**: rephrase or correct existing items when the new conversation indicates a change.
- If nothing should change, output exactly: "No change".
- Do not duplicate items; merge or replace when the same fact is updated.`;

export class UserProfileUpdater {
  constructor(
    private modelRouter: ModelRouter,
    private reflectionModel: string,
  ) {}

  async updateIfNeeded(
    userId: string,
    message: UnifiedMessage,
    result: AgentResult,
  ): Promise<void> {
    const profilePath = `data/users/${userId}/USER.md`;
    const currentProfile = (await readTextFile(profilePath)) ?? "# User Profile\n\n(Not yet fully established; will be accumulated automatically through conversation)\n";

    try {
      const analysis = await this.modelRouter.call(
        [
          { role: "system", content: PROFILE_ANALYSIS_PROMPT },
          {
            role: "user",
            content: `Current user profile:\n\n${currentProfile}\n\n---\n\nRecent exchange:\nUser: ${message.text}\nAssistant: ${result.text}\n\nOutput the complete revised user profile (add/delete/modify as needed), or "No change" if nothing should change.`,
          },
        ],
        { model: this.reflectionModel },
      );

      const text = (analysis.text ?? "").trim();
      const noChange =
        text === "No change" ||
        text.toLowerCase().includes("no change") ||
        text.length < 50;

      if (!noChange && text.includes("#") && (text.includes("- ") || text.includes("* "))) {
        await writeTextFile(profilePath, text);
        log.info({ userId }, "User profile updated (full revise: add/delete/modify)");
      }
    } catch (err) {
      log.warn({ err, userId }, "Profile update failed, skipping");
    }
  }
}

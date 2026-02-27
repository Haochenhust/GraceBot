import { createLogger } from "../shared/logger.js";
import { readTextFile, writeTextFile } from "../shared/utils.js";
import type { AgentResult, UnifiedMessage } from "../shared/types.js";
import type { ModelRouter } from "../agents/model-router.js";

const log = createLogger("user-profile");

const PROFILE_ANALYSIS_PROMPT = `You are a user profile analysis assistant. From the conversation below, extract new user traits (preferences, habits, background). Output only the new findings as Markdown list items. If nothing new, output exactly: "No new findings".`;

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
    const currentProfile = (await readTextFile(profilePath)) ?? "# User profile\n";

    try {
      const analysis = await this.modelRouter.call(
        [
          { role: "system", content: PROFILE_ANALYSIS_PROMPT },
          {
            role: "user",
            content: `Current user profile:\n${currentProfile}\n\nRecent exchange:\nUser: ${message.text}\nAssistant: ${result.text}`,
          },
        ],
        { model: this.reflectionModel },
      );

      if (
        analysis.text &&
        !analysis.text.includes("No new findings")
      ) {
        const updated = currentProfile + "\n" + analysis.text;
        await writeTextFile(profilePath, updated);
        log.info({ userId }, "User profile updated");
      }
    } catch (err) {
      log.warn({ err, userId }, "Profile update failed, skipping");
    }
  }
}

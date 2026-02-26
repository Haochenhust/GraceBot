import { createLogger } from "../shared/logger.js";
import { readTextFile, writeTextFile } from "../shared/utils.js";
import type { AgentResult, UnifiedMessage } from "../shared/types.js";
import type { ModelRouter } from "../agents/model-router.js";

const log = createLogger("user-profile");

const PROFILE_ANALYSIS_PROMPT = `你是一个用户画像分析助手。根据以下对话内容，提取用户的新特征（偏好、习惯、背景信息等）。
只输出新发现的特征，格式为 Markdown 列表项。如果没有新发现，输出 "无新发现"。`;

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
    const currentProfile = (await readTextFile(profilePath)) ?? "# 用户画像\n";

    try {
      const analysis = await this.modelRouter.call(
        [
          { role: "system", content: PROFILE_ANALYSIS_PROMPT },
          {
            role: "user",
            content: `当前用户画像:\n${currentProfile}\n\n最近对话:\n用户: ${message.text}\n助手: ${result.text}`,
          },
        ],
        { model: this.reflectionModel },
      );

      if (
        analysis.text &&
        !analysis.text.includes("无新发现")
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

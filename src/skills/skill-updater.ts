import { createLogger } from "../shared/logger.js";
import { writeTextFile } from "../shared/utils.js";
import type { ModelRouter } from "../agents/model-router.js";
import type { SkillLoader } from "./skill-loader.js";
import type { SessionManager } from "../kernel/session-manager.js";

const log = createLogger("skill-updater");

const REFLECTION_PROMPT = `你是一个技能优化助手。分析最近的对话和当前的技能定义，判断是否需要改进。
如果有改进建议，返回 JSON 格式:
{ "suggestions": [{ "skillName": "xxx", "action": "update|create", "content": "新的技能内容" }] }
如果没有改进建议，返回: { "suggestions": [] }`;

interface SkillSuggestion {
  skillName: string;
  action: "update" | "create";
  content: string;
}

export class SkillUpdater {
  private conversationCount = new Map<string, number>();

  constructor(
    private modelRouter: ModelRouter,
    private skillLoader: SkillLoader,
    private sessionManager: SessionManager,
    private reflectionModel: string,
  ) {}

  async reflectAndUpdate(userId: string): Promise<void> {
    const count = (this.conversationCount.get(userId) ?? 0) + 1;
    this.conversationCount.set(userId, count);

    if (count % 10 !== 0) return;

    log.info({ userId, count }, "Triggering skill reflection");

    const currentSkills = await this.skillLoader.loadAll(userId);

    try {
      const reflection = await this.modelRouter.call(
        [
          { role: "system", content: REFLECTION_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              currentSkills: currentSkills.map((s) => ({
                name: s.name,
                content: s.content,
              })),
            }),
          },
        ],
        { model: this.reflectionModel },
      );

      let suggestions: SkillSuggestion[] = [];
      try {
        const parsed = JSON.parse(reflection.text);
        suggestions = parsed.suggestions ?? [];
      } catch {
        return;
      }

      for (const suggestion of suggestions) {
        await this.applySkillUpdate(userId, suggestion);
      }
    } catch (err) {
      log.warn({ err, userId }, "Skill reflection failed");
    }
  }

  private async applySkillUpdate(
    userId: string,
    suggestion: SkillSuggestion,
  ): Promise<void> {
    const path = `data/users/${userId}/skills/${suggestion.skillName}.md`;
    await writeTextFile(path, suggestion.content);
    log.info({ userId, skill: suggestion.skillName }, "Skill updated");
  }
}

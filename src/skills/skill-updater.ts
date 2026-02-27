import { createLogger } from "../shared/logger.js";
import { writeTextFile } from "../shared/utils.js";
import type { ModelRouter } from "../agents/model-router.js";
import type { SkillLoader } from "./skill-loader.js";
import type { SessionManager } from "../kernel/session-manager.js";

const log = createLogger("skill-updater");

const REFLECTION_PROMPT = `You are a skill optimization assistant. Analyze the recent conversations and current skill definitions; decide if any skill needs improvement.
Rules:
- Only suggest changes that are clearly supported by the recent conversation patterns.
- Keep skill content concise, actionable, and in English.
- Respond with JSON only:
{ "suggestions": [{ "skillName": "xxx", "action": "update|create", "content": "full new skill content in English" }] }
If no changes are needed, respond with: { "suggestions": [] }`;

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

    // Load recent history from the latest session for context
    let recentHistory: Array<{ role: string; content: string }> = [];
    try {
      const sessions = await this.sessionManager.listSessions(userId);
      if (sessions.length > 0) {
        const latestSession = sessions[sessions.length - 1];
        const history = await this.sessionManager.getHistory(userId, latestSession.id);
        // Last 10 turns
        recentHistory = history
          .slice(-10)
          .map((h) => ({
            role: h.role,
            content: typeof h.content === "string" ? h.content : JSON.stringify(h.content),
          }));
      }
    } catch (err) {
      log.warn({ err }, "Could not load recent history for skill reflection");
    }

    try {
      const reflection = await this.modelRouter.call(
        [
          { role: "system", content: REFLECTION_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              currentSkills: currentSkills.map((s) => ({
                name: s.name,
                description: s.description,
                content: s.content,
              })),
              recentConversation: recentHistory,
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
    // Write in OpenClaw format: directory + SKILL.md
    const dir = `data/users/${userId}/skills/${suggestion.skillName}`;
    const content = suggestion.content.startsWith("---")
      ? suggestion.content
      : `---\nname: ${suggestion.skillName}\ndescription: Auto-updated skill\n---\n\n${suggestion.content}`;
    await writeTextFile(`${dir}/SKILL.md`, content);
    log.info({ userId, skill: suggestion.skillName }, "Skill updated");
  }
}

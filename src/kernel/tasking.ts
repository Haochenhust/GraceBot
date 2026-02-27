import { createLogger } from "../shared/logger.js";
import { readTextFile } from "../shared/utils.js";
import type {
  AgentTask,
  AgentContext,
  AgentResult,
} from "../shared/types.js";
import type { SessionManager } from "./session-manager.js";
import type { CentralController } from "./central-controller.js";
import type { AgentRunner } from "../agents/runner.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { MemoryManager } from "../memory/memory-manager.js";
import type { SkillLoader } from "../skills/skill-loader.js";
import type { HookBus } from "../plugins/hook-bus.js";

const log = createLogger("tasking");

export class Tasking {
  private centralController!: CentralController;

  constructor(
    private sessionManager: SessionManager,
    private agentRunner: AgentRunner,
    private toolRegistry: ToolRegistry,
    private memoryManager: MemoryManager,
    private skillLoader: SkillLoader,
    private hookBus: HookBus,
  ) {}

  setCentralController(controller: CentralController): void {
    this.centralController = controller;
  }

  async execute(task: AgentTask): Promise<void> {
    const { userId, message, session } = task;

    log.info({ userId, sessionId: session.id }, "Executing task");

    let result: AgentResult;
    try {
      const history = await this.sessionManager.getHistory(userId, session.id);

      const soul =
        (await readTextFile(`data/users/${userId}/SOUL.md`)) ??
        (await readTextFile("data/shared/defaults/SOUL.md"));
      const userProfile = await readTextFile(`data/users/${userId}/USER.md`);
      const skills = await this.skillLoader.loadAll(userId);
      const memories = await this.memoryManager.search(userId, message.text, 5);

      const context: AgentContext = {
        userId,
        message,
        history,
        soul,
        userProfile,
        skills,
        memories,
        tools: this.toolRegistry.getAvailableTools(),
        sessionId: session.id,
      };

      await this.hookBus.emit("before-agent", { userId, context });

      result = await this.agentRunner.run(context);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      log.error(
        {
          err,
          userId,
          messageId: message.messageId,
          errorMessage,
          errorStack,
        },
        "Agent execution failed",
      );
      await this.hookBus.emit("on-error", { error: err, userId });
      result = {
        text: "[GraceBot] 处理消息时发生错误，请稍后再试。",
        toolCalls: [],
        tokensUsed: { input: 0, output: 0 },
      };
    }

    const replyPreview =
      result.text.length > 100 ? `${result.text.slice(0, 100)}…` : result.text;
    log.info(
      {
        userId,
        messageId: message.messageId,
        replyLen: result.text.length,
        toolCallsCount: result.toolCalls.length,
        replyPreview: replyPreview || "(empty)",
      },
      "Task done, sending reply to Feishu",
    );

    await this.sessionManager.appendHistory(
      userId,
      session.id,
      message,
      result,
    );
    await this.centralController.sendReply(
      userId,
      message.chatId,
      message.messageId,
      result.text,
    );

    await this.hookBus.emit("after-agent", { userId, message, result });
  }
}

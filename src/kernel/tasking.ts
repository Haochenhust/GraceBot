import { createLogger } from "../shared/logger.js";
import { startSpan } from "../shared/tracer.js";
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
    const messageId = message.messageId;
    const span = startSpan(messageId, "tasking 执行", "kernel.tasking", {
      userId,
      sessionId: session.id,
    });

    log.info(
      {
        phase: "kernel.tasking",
        messageId,
        userId,
        sessionId: session.id,
      },
      "[flow] 开始执行 task：拉取 history / soul / skills / memories / tools",
    );

    let result: AgentResult;
    let taskErr: Error | undefined;
    try {
      const history = await this.sessionManager.getHistory(userId, session.id);

      const soul =
        (await readTextFile(`data/users/${userId}/SOUL.md`)) ??
        (await readTextFile("data/shared/defaults/SOUL.md"));
      const userProfile = await readTextFile(`data/users/${userId}/USER.md`);
      const skills = await this.skillLoader.loadAll(userId);
      const memories = await this.memoryManager.search(userId, message.text, 5);
      const tools = this.toolRegistry.getAvailableTools();

      const context: AgentContext = {
        userId,
        message,
        history,
        soul,
        userProfile,
        skills,
        memories,
        tools,
        sessionId: session.id,
      };

      log.info(
        {
          phase: "kernel.tasking",
          messageId,
          historyLen: history.length,
          skillNames: skills.map((s) => s.name),
          toolNames: tools.map((t) => t.name),
          memoriesCount: memories.length,
        },
        "[flow] context 构建完成，进入 agent",
      );

      await this.hookBus.emit("before-agent", { userId, context });

      result = await this.agentRunner.run(context);
    } catch (err) {
      taskErr = err instanceof Error ? err : new Error(String(err));
      const errorMessage = taskErr.message;
      const errorStack = taskErr.stack;
      log.error(
        {
          phase: "kernel.tasking",
          messageId,
          userId,
          sessionId: session.id,
          error: errorMessage,
          stack: errorStack,
          err,
        },
        "[flow] agent 执行异常，将回复兜底文案",
      );
      await this.hookBus.emit("on-error", { error: err, userId });
      result = {
        text: "[GraceBot] 处理消息时发生错误，请稍后再试。",
        toolCalls: [],
        tokensUsed: { input: 0, output: 0 },
      };
    } finally {
      span.end(taskErr);
    }

    const replyPreview =
      result.text.length > 100 ? `${result.text.slice(0, 100)}…` : result.text;
    log.info(
      {
        phase: "kernel.tasking.done",
        messageId,
        userId,
        replyLen: result.text.length,
        toolCallsCount: result.toolCalls.length,
        replyPreview: replyPreview || "(empty)",
      },
      "[flow] task 完成，即将发送回复",
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

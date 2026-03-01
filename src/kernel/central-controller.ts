import { createLogger } from "../shared/logger.js";
import { startSpan } from "../shared/tracer.js";
import type { UnifiedMessage } from "../shared/types.js";
import type { SessionManager } from "./session-manager.js";
import type { Scheduling } from "./scheduling.js";
import type { FeishuAPI } from "../gateway/feishu-api.js";
import type { HookBus } from "../plugins/hook-bus.js";

const log = createLogger("central-controller");

export class CentralController {
  constructor(
    private sessionManager: SessionManager,
    private scheduling: Scheduling,
    private feishuAPI: FeishuAPI,
    private hookBus: HookBus,
  ) {}

  async dispatch(message: UnifiedMessage): Promise<void> {
    const span = startSpan(
      message.messageId,
      "central-controller dispatch",
      "kernel.dispatch",
      { userId: message.userId, chatType: message.chatType },
    );
    try {
      log.info(
        {
          phase: "kernel.dispatch",
          messageId: message.messageId,
          userId: message.userId,
          chatType: message.chatType,
        },
        "[flow] 进入 central-controller dispatch",
      );

      const processed = await this.hookBus.emit("on-message", { message });
      if (processed?.intercepted) {
        log.info(
          { phase: "kernel.dispatch", messageId: message.messageId },
          "[flow] 被 on-message 插件拦截，不再入队",
        );
        return;
      }

      if (
        message.chatType === "group" &&
        !message.mentions?.some((m) => m.isBot)
      ) {
        log.info(
          { phase: "kernel.dispatch", messageId: message.messageId },
          "[flow] 群消息未 @ 机器人，跳过",
        );
        return;
      }

      const rootId = message.rootId ?? message.messageId;
      const session = await this.sessionManager.getOrCreate(
        message.userId,
        message.chatId,
        rootId,
      );
      log.info(
        {
          phase: "kernel.dispatch",
          messageId: message.messageId,
          sessionId: session.id,
          rootId,
        },
        "[flow] 会话就绪，入队 agent-task",
      );

      await this.scheduling.enqueue({
        type: "agent-task",
        userId: message.userId,
        message,
        session,
      });
    } finally {
      span.end();
    }
  }

  async sendReply(
    userId: string,
    chatId: string,
    messageId: string,
    text: string,
  ): Promise<void> {
    const span = startSpan(messageId, "回复飞书", "reply", {
      userId,
      replyLen: text.length,
    });
    log.info(
      {
        phase: "reply",
        messageId,
        userId,
        replyLen: text.length,
        replyPreview: text.length > 120 ? `${text.slice(0, 120)}…` : text,
      },
      "[flow] 回复用户（飞书）",
    );
    try {
      await this.feishuAPI.replyMessage(messageId, text, { chatId });
    } catch (err) {
      span.end(err instanceof Error ? err : new Error(String(err)));
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : undefined;
      log.error(
        {
          phase: "reply",
          messageId,
          userId,
          error: errMsg,
          stack: errStack,
          err,
        },
        "[flow] 回复飞书失败",
      );
      throw err;
    }
    span.end();
  }
}

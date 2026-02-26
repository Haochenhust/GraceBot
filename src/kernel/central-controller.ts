import { createLogger } from "../shared/logger.js";
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
    log.info(
      { userId: message.userId, chatType: message.chatType },
      "Dispatching message",
    );

    const processed = await this.hookBus.emit("on-message", { message });
    if (processed?.intercepted) return;

    // 群聊中只响应 @机器人 的消息
    if (
      message.chatType === "group" &&
      !message.mentions?.some((m) => m.isBot)
    ) {
      log.debug("Group message without bot mention, skipping");
      return;
    }

    const session = await this.sessionManager.getOrCreate(message.userId);

    await this.scheduling.enqueue({
      type: "agent-task",
      userId: message.userId,
      message,
      session,
    });
  }

  async sendReply(
    userId: string,
    chatId: string,
    messageId: string,
    text: string,
  ): Promise<void> {
    log.info({ userId, messageId }, "Sending reply");
    await this.feishuAPI.replyMessage(messageId, text);
  }
}

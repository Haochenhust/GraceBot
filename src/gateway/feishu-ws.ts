import * as Lark from "@larksuiteoapi/node-sdk";
import { normalizeFeishuEvent } from "./normalizer.js";
import { createLogger } from "../shared/logger.js";
import { startSpan } from "../shared/tracer.js";
import type { CentralController } from "../kernel/central-controller.js";
import type { AppConfig } from "../shared/types.js";

const log = createLogger("feishu-ws");

/**
 * 使用飞书官方 SDK 长连接模式接收事件（无需公网、无需签名验证）。
 * 参考：https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/event-subscription-guide/long-connection-mode
 */
export function startFeishuLongConnection(
  feishuConfig: AppConfig["feishu"],
  controller: CentralController,
): void {
  const { app_id, app_secret } = feishuConfig;

  const wsClient = new Lark.WSClient({
    appId: app_id,
    appSecret: app_secret,
    loggerLevel: Lark.LoggerLevel.info,
  });

  const eventDispatcher = new Lark.EventDispatcher({}).register({
    "im.message.receive_v1": async (data: Record<string, unknown>) => {
      const message = normalizeFeishuEvent({ event: data });
      if (message) {
        const textPreview =
          message.text.length > 80 ? `${message.text.slice(0, 80)}…` : message.text;
        log.info(
          {
            phase: "gateway",
            messageId: message.messageId,
            userId: message.userId,
            chatType: message.chatType,
            textPreview: textPreview || "(empty)",
          },
          "[flow] 收到飞书消息，进入 dispatch",
        );
        const span = startSpan(
          message.messageId,
          "收到飞书消息",
          "gateway",
          { userId: message.userId, chatType: message.chatType, textLen: message.text.length },
        );
        controller.dispatch(message).then(
          () => span.end(),
          (err) => {
            span.end(err instanceof Error ? err : new Error(String(err)));
            const errMsg = err instanceof Error ? err.message : String(err);
            const errStack = err instanceof Error ? err.stack : undefined;
            log.error(
              {
                phase: "gateway",
                messageId: message.messageId,
                userId: message.userId,
                error: errMsg,
                stack: errStack,
                err,
              },
              "[flow] dispatch 失败",
            );
          },
        );
      }
    },
  });

  wsClient.start({ eventDispatcher });
  log.info("Feishu long connection (WSClient) started");
}

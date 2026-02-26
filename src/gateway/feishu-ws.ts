import * as Lark from "@larksuiteoapi/node-sdk";
import { normalizeFeishuEvent } from "./normalizer.js";
import { createLogger } from "../shared/logger.js";
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
            userId: message.userId,
            messageId: message.messageId,
            chatType: message.chatType,
            textPreview: textPreview || "(empty)",
          },
          "Feishu message received, dispatching",
        );
        controller.dispatch(message).catch((err) => {
          log.error({ err, messageId: message.messageId }, "Failed to dispatch message");
        });
      }
    },
  });

  wsClient.start({ eventDispatcher });
  log.info("Feishu long connection (WSClient) started");
}

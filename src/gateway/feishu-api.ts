import { createLogger } from "../shared/logger.js";
import type { AppConfig } from "../shared/types.js";

const log = createLogger("feishu-api");

const FEISHU_BASE_URL = "https://open.feishu.cn/open-apis";

export class FeishuAPI {
  private tenantAccessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private config: AppConfig["feishu"]) {}

  private async ensureToken(): Promise<string> {
    if (this.tenantAccessToken && Date.now() < this.tokenExpiresAt) {
      return this.tenantAccessToken;
    }

    const res = await fetch(
      `${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: this.config.app_id,
          app_secret: this.config.app_secret,
        }),
      },
    );

    const data = (await res.json()) as {
      tenant_access_token: string;
      expire: number;
    };
    this.tenantAccessToken = data.tenant_access_token;
    this.tokenExpiresAt = Date.now() + (data.expire - 60) * 1000;

    log.info("Feishu tenant access token refreshed");
    return this.tenantAccessToken;
  }

  /**
   * 回复到指定消息（话题内）。若话题已被用户删除会返回 230019，可降级为向会话发新消息。
   * @param chatId 可选；当回复失败且错误码为 230019（话题不存在）时，用此 chatId 调用 sendMessage 发到会话
   */
  async replyMessage(
    messageId: string,
    text: string,
    options?: { chatId?: string },
  ): Promise<void> {
    const token = await this.ensureToken();

    const res = await fetch(
      `${FEISHU_BASE_URL}/im/v1/messages/${messageId}/reply`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: JSON.stringify({ text }),
          msg_type: "text",
        }),
      },
    );

    if (res.ok) return;

    const body = await res.text();
    let code: number | undefined;
    try {
      const data = JSON.parse(body) as { code?: number };
      code = data.code;
    } catch {
      /* ignore */
    }

    // 话题已被删除，无法往该话题回复；降级为向会话发新消息
    if (code === 230019 && options?.chatId) {
      log.warn(
        { messageId, chatId: options.chatId },
        "Topic no longer exists (230019), sending to chat instead",
      );
      await this.sendMessage(options.chatId, text);
      return;
    }

    log.error({ messageId, status: res.status, body }, "Failed to reply");
    throw new Error(`Feishu reply failed: ${res.status}`);
  }

  async sendMessage(
    chatId: string,
    text: string,
    msgType = "text",
  ): Promise<void> {
    const token = await this.ensureToken();

    const res = await fetch(
      `${FEISHU_BASE_URL}/im/v1/messages?receive_id_type=chat_id`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: chatId,
          content: JSON.stringify({ text }),
          msg_type: msgType,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      log.error({ chatId, status: res.status, body }, "Failed to send");
      throw new Error(`Feishu send failed: ${res.status}`);
    }
  }
}

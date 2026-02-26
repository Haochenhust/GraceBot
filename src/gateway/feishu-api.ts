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

  async replyMessage(messageId: string, text: string): Promise<void> {
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

    if (!res.ok) {
      const body = await res.text();
      log.error({ messageId, status: res.status, body }, "Failed to reply");
      throw new Error(`Feishu reply failed: ${res.status}`);
    }
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

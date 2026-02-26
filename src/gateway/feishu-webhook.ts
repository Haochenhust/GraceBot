import { Hono } from "hono";
import { normalizeFeishuEvent } from "./normalizer.js";
import { createLogger } from "../shared/logger.js";
import type { CentralController } from "../kernel/central-controller.js";

const log = createLogger("feishu-webhook");

const eventCache = new Map<string, number>();

const EVENT_CACHE_TTL = 5 * 60 * 1000;

function cleanupEventCache() {
  const now = Date.now();
  for (const [key, timestamp] of eventCache) {
    if (now - timestamp > EVENT_CACHE_TTL) {
      eventCache.delete(key);
    }
  }
}

setInterval(cleanupEventCache, 60_000);

export function createFeishuWebhookRoute(controller: CentralController) {
  const app = new Hono();

  app.post("/feishu", async (c) => {
    const body = await c.req.json();

    // URL Verification (飞书首次配置回调时的验证请求)
    if (body.type === "url_verification") {
      return c.json({ challenge: body.challenge });
    }

    // 签名验证
    // TODO: implement verifySignature with Verification Token / Encrypt Key
    // if (!verifySignature(c.req, body)) {
    //   return c.json({ error: "invalid signature" }, 403);
    // }

    // 幂等去重 (飞书可能重试推送)
    const eventId = body.header?.event_id;
    if (eventId && eventCache.has(eventId)) {
      log.debug({ eventId }, "Duplicate event, skipping");
      return c.json({ ok: true });
    }
    if (eventId) {
      eventCache.set(eventId, Date.now());
    }

    // 归一化 + 派发给 Kernel (异步，不阻塞 Webhook 响应)
    const message = normalizeFeishuEvent(body);
    if (message) {
      controller.dispatch(message).catch((err) => {
        log.error({ err, eventId }, "Failed to dispatch message");
      });
    }

    return c.json({ ok: true });
  });

  return app;
}

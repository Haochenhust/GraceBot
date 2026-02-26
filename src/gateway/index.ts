import { Hono } from "hono";
import { createFeishuWebhookRoute } from "./feishu-webhook.js";
import { createLogger } from "../shared/logger.js";
import type { CentralController } from "../kernel/central-controller.js";

const log = createLogger("gateway");

export function createGateway(controller: CentralController) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

  app.route("/webhook", createFeishuWebhookRoute(controller));

  log.info("Gateway routes registered");
  return app;
}

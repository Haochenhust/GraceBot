import { Hono } from "hono";
import { createLogger } from "../shared/logger.js";
import type { CentralController } from "../kernel/central-controller.js";
import { startFeishuLongConnection } from "./feishu-ws.js";
import type { AppConfig } from "../shared/types.js";

const log = createLogger("gateway");

export function createGateway(
  controller: CentralController,
  feishuConfig: AppConfig["feishu"],
) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

  startFeishuLongConnection(feishuConfig, controller);

  log.info("Gateway routes registered (Feishu long connection)");
  return app;
}

import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { Hono } from "hono";
import { createLogger } from "../shared/logger.js";
import type { CentralController } from "../kernel/central-controller.js";
import { startFeishuLongConnection } from "./feishu-ws.js";
import { TRACE_VIEWER_HTML } from "./trace-viewer.html.js";
import type { AppConfig } from "../shared/types.js";

const log = createLogger("gateway");
const LOGS_DIR = join(process.cwd(), "logs");

export function createGateway(
  controller: CentralController,
  feishuConfig: AppConfig["feishu"],
) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

  /** Trace 可视化页面 */
  app.get("/trace", (c) =>
    c.html(TRACE_VIEWER_HTML),
  );

  /** 列出所有运行批次（logs 下按 年月日时分秒 命名的目录） */
  app.get("/api/trace/runs", (c) => {
    if (!existsSync(LOGS_DIR)) {
      return c.json([]);
    }
    const names = readdirSync(LOGS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => /^\d{8}-\d{6}$/.test(n))
      .sort()
      .reverse();
    return c.json(names.map((name) => ({ name })));
  });

  /** 获取指定批次的 trace 记录（trace.jsonl 每行一条 JSON） */
  app.get("/api/trace", async (c) => {
    let run = c.req.query("run");
    if (!run) {
      if (!existsSync(LOGS_DIR)) return c.json([]);
      const names = readdirSync(LOGS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((n) => /^\d{8}-\d{6}$/.test(n))
        .sort()
        .reverse();
      run = names[0];
    }
    if (!run) return c.json([]);
    const tracePath = join(LOGS_DIR, run, "trace.jsonl");
    if (!existsSync(tracePath)) return c.json([]);
    const raw = readFileSync(tracePath, "utf8");
    const spans = raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return c.json(spans);
  });

  startFeishuLongConnection(feishuConfig, controller);

  log.info("Gateway routes registered (Feishu long connection, GET /trace)");
  return app;
}

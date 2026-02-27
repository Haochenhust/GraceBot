import { createLogger } from "../shared/logger.js";
import type { GraceBotPlugin, CronJob } from "../shared/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { HookBus } from "./hook-bus.js";
import type { Hono } from "hono";

const log = createLogger("plugin-manager");

export class PluginManager {
  private plugins: GraceBotPlugin[] = [];
  private cronTimer: ReturnType<typeof setInterval> | null = null;
  private cronJobs: CronJob[] = [];

  constructor(
    private toolRegistry: ToolRegistry,
    private hookBus: HookBus,
    private app: Hono,
  ) {}

  register(plugin: GraceBotPlugin): void {
    log.info({ plugin: plugin.name, version: plugin.version }, "Registering plugin");

    if (plugin.tools) {
      this.toolRegistry.registerFromPlugin(plugin.name, plugin.tools);
    }

    if (plugin.hooks) {
      for (const [name, handler] of Object.entries(plugin.hooks)) {
        this.hookBus.on(
          name as keyof typeof plugin.hooks,
          handler as (...args: unknown[]) => Promise<unknown>,
        );
      }
    }

    if (plugin.routes) {
      for (const route of plugin.routes) {
        const method = route.method.toLowerCase() as "get" | "post";
        (this.app[method] as (path: string, handler: (c: unknown) => Promise<Response>) => void)(
          route.path,
          route.handler,
        );
      }
    }

    if (plugin.cron) {
      for (const job of plugin.cron) {
        log.info({ schedule: job.schedule }, "Cron job registered");
        this.cronJobs.push(job);
      }
      this.ensureCronLoop();
    }

    this.plugins.push(plugin);
  }

  getPlugins(): GraceBotPlugin[] {
    return [...this.plugins];
  }

  /** Start the cron tick loop (fires every minute). */
  private ensureCronLoop(): void {
    if (this.cronTimer) return;

    // Align to next whole minute, then tick every 60s
    const msToNextMinute = (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds();
    setTimeout(() => {
      this.tickCron();
      this.cronTimer = setInterval(() => this.tickCron(), 60_000);
    }, msToNextMinute);

    log.info({ jobs: this.cronJobs.length }, "Cron loop starting");
  }

  private tickCron(): void {
    const now = new Date();
    for (const job of this.cronJobs) {
      if (matchesCron(job.schedule, now)) {
        job.handler().catch((err: unknown) => {
          log.error({ err, schedule: job.schedule }, "Cron job failed");
        });
      }
    }
  }
}

// ─── Minimal cron expression matcher ────────────────────────────────────────
// Supports: * and exact values for minute, hour, day-of-month, month, day-of-week
// e.g. "0 9 * * *" = every day at 09:00
// e.g. "*/30 * * * *" = every 30 minutes

function matchesCron(expr: string, now: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minExpr, hourExpr, domExpr, monExpr, dowExpr] = parts;

  const minute = now.getMinutes();
  const hour = now.getHours();
  const dom = now.getDate();
  const mon = now.getMonth() + 1; // 1-12
  const dow = now.getDay();       // 0=Sun

  return (
    matchField(minExpr, minute, 0, 59) &&
    matchField(hourExpr, hour, 0, 23) &&
    matchField(domExpr, dom, 1, 31) &&
    matchField(monExpr, mon, 1, 12) &&
    matchField(dowExpr, dow, 0, 6)
  );
}

function matchField(expr: string, value: number, _min: number, max: number): boolean {
  if (expr === "*") return true;

  // */n — every n units
  if (expr.startsWith("*/")) {
    const step = parseInt(expr.slice(2), 10);
    return !isNaN(step) && step > 0 && value % step === 0;
  }

  // a-b — range
  if (expr.includes("-")) {
    const [a, b] = expr.split("-").map(Number);
    return value >= a && value <= b;
  }

  // a,b,c — list
  if (expr.includes(",")) {
    return expr.split(",").map(Number).includes(value);
  }

  // exact value — handles "L" (last) as max for simplicity
  if (expr === "L") return value === max;
  const n = parseInt(expr, 10);
  return !isNaN(n) && n === value;
}

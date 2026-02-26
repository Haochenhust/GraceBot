import { createLogger } from "../shared/logger.js";
import type { GraceBotPlugin } from "../shared/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { HookBus } from "./hook-bus.js";
import type { Hono } from "hono";

const log = createLogger("plugin-manager");

export class PluginManager {
  private plugins: GraceBotPlugin[] = [];

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
        log.info({ schedule: job.schedule }, "Cron job registered (execution not yet implemented)");
        // TODO: implement cron scheduling
      }
    }

    this.plugins.push(plugin);
  }

  getPlugins(): GraceBotPlugin[] {
    return [...this.plugins];
  }
}

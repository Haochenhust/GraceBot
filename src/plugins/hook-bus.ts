import { createLogger } from "../shared/logger.js";
import type { PluginHooks, HookResult } from "../shared/types.js";

const log = createLogger("hook-bus");

type HookName = keyof PluginHooks;
type HookHandler = (...args: unknown[]) => Promise<unknown>;

export class HookBus {
  private hooks = new Map<string, HookHandler[]>();

  on(name: HookName, handler: HookHandler): void {
    const handlers = this.hooks.get(name) ?? [];
    handlers.push(handler);
    this.hooks.set(name, handlers);
  }

  async emit(name: HookName, context: unknown): Promise<HookResult> {
    const handlers = this.hooks.get(name) ?? [];

    for (const handler of handlers) {
      try {
        const result = (await handler(context)) as HookResult | undefined;
        if (result?.intercepted) {
          log.info({ hook: name }, "Hook intercepted");
          return result;
        }
      } catch (err) {
        log.error({ hook: name, err }, "Hook handler error");
      }
    }

    return {};
  }
}

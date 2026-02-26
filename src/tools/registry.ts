import { createLogger } from "../shared/logger.js";
import type {
  ToolDefinition,
  ToolContext,
  ToolResult,
  LLMToolSchema,
} from "../shared/types.js";

const log = createLogger("tool-registry");

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    log.debug({ tool: tool.name }, "Tool registered");
  }

  registerFromPlugin(pluginName: string, tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.tools.set(`${pluginName}.${tool.name}`, tool);
    }
  }

  getAvailableTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  toLLMTools(): LLMToolSchema[] {
    return this.getAvailableTools().map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  async execute(
    name: string,
    params: unknown,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { content: `Unknown tool: ${name}`, isError: true };
    }

    try {
      log.info({ tool: name }, "Executing tool");
      return await tool.execute(params, context);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error({ tool: name, error: msg }, "Tool execution failed");
      return { content: `Tool error: ${msg}`, isError: true };
    }
  }
}

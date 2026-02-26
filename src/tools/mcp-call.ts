import type { ToolDefinition } from "../shared/types.js";

interface MCPCallParams {
  server: string;
  tool: string;
  args: Record<string, unknown>;
}

export const mcpCallTool: ToolDefinition = {
  name: "mcp_call",
  description:
    "通过 MCP (Model Context Protocol) 调用外部工具服务器。",
  parameters: {
    type: "object",
    properties: {
      server: { type: "string", description: "MCP 服务器名称" },
      tool: { type: "string", description: "工具名称" },
      args: { type: "object", description: "工具参数" },
    },
    required: ["server", "tool", "args"],
  },
  async execute(params, _context) {
    const { server, tool, args: _args } = params as MCPCallParams;

    // TODO: implement MCP client using @modelcontextprotocol/sdk
    return {
      content: `[mcp_call] Call ${server}.${tool} — MCP client not yet implemented.`,
      isError: true,
    };
  },
};

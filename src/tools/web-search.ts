import type { ToolDefinition } from "../shared/types.js";

interface WebSearchParams {
  query: string;
  limit?: number;
}

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description: "搜索互联网获取实时信息。返回搜索结果摘要和链接。",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "搜索关键词" },
      limit: { type: "number", description: "返回结果数量，默认 5", default: 5 },
    },
    required: ["query"],
  },
  async execute(params, _context) {
    const { query, limit: _limit } = params as WebSearchParams;

    // TODO: integrate with a search API (SerpAPI, Tavily, etc.)
    return {
      content: `[web_search] Search for "${query}" — not yet implemented. Please configure a search API provider.`,
      isError: true,
    };
  },
};

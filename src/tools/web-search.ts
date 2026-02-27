import type { ToolDefinition } from "../shared/types.js";

interface WebSearchParams {
  query: string;
  limit?: number;
}

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description: "Search the web for up-to-date information. Returns result snippets and links. Requires a search API to be configured.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      limit: { type: "number", description: "Max results to return, default 5", default: 5 },
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

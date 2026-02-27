import { createLogger } from "../shared/logger.js";
import { truncateResult } from "../shared/utils.js";
import type { ToolDefinition } from "../shared/types.js";

const log = createLogger("web-search");

const TAVILY_URL = "https://api.tavily.com/search";

interface WebSearchParams {
  query: string;
  limit?: number;
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface TavilyResponse {
  results?: TavilyResult[];
  error?: string;
}

/**
 * Create a web_search tool backed by Tavily.
 * If no API key is provided, the tool returns an informative error instead of crashing.
 */
export function createWebSearchTool(tavilyApiKey?: string): ToolDefinition {
  return {
    name: "web_search",
    description:
      "Search the web for up-to-date information using Tavily. Returns relevant snippets and source links.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: {
          type: "number",
          description: "Max results to return, default 5",
          default: 5,
        },
      },
      required: ["query"],
    },
    async execute(params, _context) {
      const { query, limit = 5 } = params as WebSearchParams;

      if (!tavilyApiKey) {
        return {
          content: "web_search is not configured: no TAVILY_API_KEY found.",
          isError: true,
        };
      }

      let data: TavilyResponse;
      try {
        const res = await fetch(TAVILY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tavilyApiKey}`,
          },
          body: JSON.stringify({
            query,
            max_results: limit,
            include_answer: false,
            search_depth: "basic",
          }),
          signal: AbortSignal.timeout(15_000),
        });

        data = (await res.json()) as TavilyResponse;

        if (!res.ok) {
          const errMsg = data.error ?? `HTTP ${res.status}`;
          log.error({ query, status: res.status, errMsg }, "Tavily error");
          return { content: `Search failed: ${errMsg}`, isError: true };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error({ query, err: msg }, "Tavily request failed");
        return { content: `Search request failed: ${msg}`, isError: true };
      }

      const results = data.results ?? [];
      if (results.length === 0) {
        return { content: `No results found for: ${query}` };
      }

      const formatted = results
        .slice(0, limit)
        .map((r, i) => {
          const snippet = truncateResult(r.content, 400);
          return `${i + 1}. **${r.title}**\n   ${r.url}\n   ${snippet}`;
        })
        .join("\n\n");

      log.info({ query, resultCount: results.length }, "Tavily search done");
      return { content: formatted };
    },
  };
}

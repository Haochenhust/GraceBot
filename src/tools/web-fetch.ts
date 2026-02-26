import type { ToolDefinition } from "../shared/types.js";

interface WebFetchParams {
  url: string;
  max_length?: number;
}

export const webFetchTool: ToolDefinition = {
  name: "web_fetch",
  description: "抓取指定 URL 的网页内容并返回文本。",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "要抓取的 URL" },
      max_length: {
        type: "number",
        description: "最大返回字符数，默认 8000",
        default: 8000,
      },
    },
    required: ["url"],
  },
  async execute(params, _context) {
    const { url, max_length = 8000 } = params as WebFetchParams;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "GraceBot/0.1" },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        return {
          content: `HTTP ${res.status}: ${res.statusText}`,
          isError: true,
        };
      }

      let text = await res.text();

      // Basic HTML tag stripping
      text = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (text.length > max_length) {
        text = text.slice(0, max_length) + "\n...[truncated]";
      }

      return { content: text };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Failed to fetch: ${msg}`, isError: true };
    }
  },
};

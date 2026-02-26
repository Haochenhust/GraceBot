import { readFile } from "fs/promises";
import { resolve } from "path";
import type { ToolDefinition } from "../shared/types.js";

interface FileReadParams {
  path: string;
  offset?: number;
  limit?: number;
}

export const fileReadTool: ToolDefinition = {
  name: "file_read",
  description: "读取指定路径的文件内容。支持通过 offset 和 limit 读取部分内容。",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径（相对于用户 workspace）" },
      offset: { type: "number", description: "起始行号（从 0 开始）" },
      limit: { type: "number", description: "读取行数" },
    },
    required: ["path"],
  },
  async execute(params, context) {
    const { path: filePath, offset, limit } = params as FileReadParams;
    const fullPath = resolve(context.workspaceDir, filePath);

    try {
      const content = await readFile(fullPath, "utf-8");

      if (offset !== undefined || limit !== undefined) {
        const lines = content.split("\n");
        const start = offset ?? 0;
        const end = limit ? start + limit : lines.length;
        return { content: lines.slice(start, end).join("\n") };
      }

      return { content };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Failed to read file: ${msg}`, isError: true };
    }
  },
};

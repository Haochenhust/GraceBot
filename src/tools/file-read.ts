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
  description: "Read file content at the given path (relative to user workspace). Supports offset and limit for partial read.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to user workspace" },
      offset: { type: "number", description: "Start line index (0-based)" },
      limit: { type: "number", description: "Number of lines to read" },
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

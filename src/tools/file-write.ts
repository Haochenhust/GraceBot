import { writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import type { ToolDefinition } from "../shared/types.js";

interface FileWriteParams {
  path: string;
  content: string;
}

export const fileWriteTool: ToolDefinition = {
  name: "file_write",
  description: "Write content to a file at the given path. Creates file and parent directories if they do not exist. Path is relative to user workspace.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to user workspace" },
      content: { type: "string", description: "Content to write" },
    },
    required: ["path", "content"],
  },
  async execute(params, context) {
    const { path: filePath, content } = params as FileWriteParams;
    const fullPath = resolve(context.workspaceDir, filePath);

    try {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf-8");
      return { content: `File written: ${filePath}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Failed to write file: ${msg}`, isError: true };
    }
  },
};

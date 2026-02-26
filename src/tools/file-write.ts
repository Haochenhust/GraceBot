import { writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import type { ToolDefinition } from "../shared/types.js";

interface FileWriteParams {
  path: string;
  content: string;
}

export const fileWriteTool: ToolDefinition = {
  name: "file_write",
  description: "将内容写入指定路径的文件。如果文件不存在会自动创建，包括必要的目录。",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径（相对于用户 workspace）" },
      content: { type: "string", description: "要写入的内容" },
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

import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import type { ToolDefinition } from "../shared/types.js";

interface FileEditParams {
  path: string;
  old_string: string;
  new_string: string;
}

export const fileEditTool: ToolDefinition = {
  name: "file_edit",
  description:
    "精确替换文件中的指定文本。提供要替换的旧文本和新文本，old_string 必须在文件中唯一匹配。",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径（相对于用户 workspace）" },
      old_string: { type: "string", description: "要替换的原始文本" },
      new_string: { type: "string", description: "替换后的新文本" },
    },
    required: ["path", "old_string", "new_string"],
  },
  async execute(params, context) {
    const { path: filePath, old_string, new_string } =
      params as FileEditParams;
    const fullPath = resolve(context.workspaceDir, filePath);

    try {
      const content = await readFile(fullPath, "utf-8");

      const occurrences = content.split(old_string).length - 1;
      if (occurrences === 0) {
        return {
          content: "old_string not found in file",
          isError: true,
        };
      }
      if (occurrences > 1) {
        return {
          content: `old_string found ${occurrences} times, must be unique`,
          isError: true,
        };
      }

      const newContent = content.replace(old_string, new_string);
      await writeFile(fullPath, newContent, "utf-8");

      return { content: `File edited: ${filePath}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Failed to edit file: ${msg}`, isError: true };
    }
  },
};

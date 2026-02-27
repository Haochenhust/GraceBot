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
    "Replace exact text in a file. Provide old_string and new_string; old_string must match exactly once in the file.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to user workspace" },
      old_string: { type: "string", description: "Exact text to replace" },
      new_string: { type: "string", description: "Replacement text" },
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

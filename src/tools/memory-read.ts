import type { ToolDefinition } from "../shared/types.js";
import type { MemoryManager } from "../memory/memory-manager.js";

export function createMemoryReadTool(
  memoryManager: MemoryManager,
): ToolDefinition {
  return {
    name: "memory_read",
    description:
      "检索与查询相关的记忆。返回过往对话中记住的重要信息。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词或问题" },
        limit: { type: "number", description: "返回条数，默认 5", default: 5 },
      },
      required: ["query"],
    },
    async execute(params, context) {
      const { query, limit = 5 } = params as {
        query: string;
        limit?: number;
      };

      const memories = await memoryManager.search(
        context.userId,
        query,
        limit,
      );

      if (memories.length === 0) {
        return { content: "No relevant memories found." };
      }

      const formatted = memories
        .map(
          (m) =>
            `[${m.createdAt}] (${m.category}, importance: ${m.importance}) ${m.content}`,
        )
        .join("\n");

      return { content: formatted };
    },
  };
}

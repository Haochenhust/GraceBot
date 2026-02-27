import type { ToolDefinition } from "../shared/types.js";
import type { MemoryManager } from "../memory/memory-manager.js";

export function createMemoryReadTool(
  memoryManager: MemoryManager,
): ToolDefinition {
  return {
    name: "memory_read",
    description:
      "Retrieve memories relevant to a query. Returns important information stored from past conversations.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query or question" },
        limit: { type: "number", description: "Max entries to return, default 5", default: 5 },
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

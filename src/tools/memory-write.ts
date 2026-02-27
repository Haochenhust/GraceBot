import type { ToolDefinition, MemoryEntry } from "../shared/types.js";
import type { MemoryManager } from "../memory/memory-manager.js";

export function createMemoryWriteTool(
  memoryManager: MemoryManager,
): ToolDefinition {
  return {
    name: "memory_write",
    description:
      "Store an important fact for long-term memory. Use when the user explicitly asks to remember something or when the conversation reveals lasting preferences/facts.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Content to remember" },
        category: {
          type: "string",
          enum: ["preference", "fact", "event", "skill"],
          description: "Category: preference, fact, event, or skill",
        },
        importance: {
          type: "number",
          description: "Importance 1-10",
          minimum: 1,
          maximum: 10,
        },
      },
      required: ["content", "category", "importance"],
    },
    async execute(params, context) {
      const { content, category, importance } = params as {
        content: string;
        category: MemoryEntry["category"];
        importance: number;
      };

      await memoryManager.write(context.userId, {
        userId: context.userId,
        content,
        category,
        importance,
        createdAt: new Date().toISOString(),
        source: {
          sessionId: context.sessionId ?? "",
          messageId: context.messageId ?? "",
        },
      });

      return { content: `Memory saved: "${content}"` };
    },
  };
}

import type { ToolDefinition, MemoryEntry } from "../shared/types.js";
import type { MemoryManager } from "../memory/memory-manager.js";

export function createMemoryWriteTool(
  memoryManager: MemoryManager,
): ToolDefinition {
  return {
    name: "memory_write",
    description:
      "记住一条重要信息。当对话中出现值得长期记忆的内容时使用。",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "要记住的内容" },
        category: {
          type: "string",
          enum: ["preference", "fact", "event", "skill"],
          description: "分类：preference(偏好), fact(事实), event(事件), skill(技能)",
        },
        importance: {
          type: "number",
          description: "重要性 1-10",
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
        source: { sessionId: "", messageId: "" },
      });

      return { content: `Memory saved: "${content}"` };
    },
  };
}

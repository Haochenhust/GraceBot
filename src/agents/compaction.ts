import { createLogger } from "../shared/logger.js";
import type { LLMMessage } from "../shared/types.js";
import type { ModelRouter } from "./model-router.js";

const log = createLogger("compaction");

const COMPACTION_PROMPT = `你是一个对话压缩助手。请将以下对话历史压缩为一段简洁的摘要，保留关键信息和上下文。
用中文输出，保持核心事实和用户意图。`;

export class Compaction {
  constructor(
    private modelRouter: ModelRouter,
    private compactionModel: string,
  ) {}

  async compact(messages: LLMMessage[]): Promise<LLMMessage[]> {
    if (messages.length <= 4) return messages;

    log.info({ messageCount: messages.length }, "Compacting conversation history");

    const systemMsg = messages[0];
    const recentMessages = messages.slice(-4);
    const toCompact = messages.slice(1, -4);

    if (toCompact.length === 0) return messages;

    const compactContent = toCompact
      .map((m) => `[${m.role}]: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
      .join("\n");

    try {
      const summary = await this.modelRouter.call(
        [
          { role: "system", content: COMPACTION_PROMPT },
          { role: "user", content: compactContent },
        ],
        { model: this.compactionModel },
      );

      return [
        systemMsg,
        { role: "user", content: `[对话历史摘要]\n${summary.text}` },
        ...recentMessages,
      ];
    } catch (err) {
      log.error({ err }, "Compaction failed, dropping old messages instead");
      return [systemMsg, ...recentMessages];
    }
  }
}

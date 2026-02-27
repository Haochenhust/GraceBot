import { createLogger } from "../shared/logger.js";
import { truncateResult } from "../shared/utils.js";
import type {
  AgentContext,
  AgentResult,
  LLMMessage,
  LLMResponse,
  ToolCallRecord,
  ToolResultBlock,
} from "../shared/types.js";
import type { PromptBuilder } from "./prompt-builder.js";
import type { ModelRouter } from "./model-router.js";
import type { Compaction } from "./compaction.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { HookBus } from "../plugins/hook-bus.js";
import { getUserWorkspace } from "../shared/utils.js";

const log = createLogger("agent-runner");

export class AgentRunner {
  private maxToolRounds: number;

  constructor(
    private promptBuilder: PromptBuilder,
    private modelRouter: ModelRouter,
    private compaction: Compaction,
    private toolRegistry: ToolRegistry,
    private hookBus: HookBus,
    maxToolRounds = 20,
  ) {
    this.maxToolRounds = maxToolRounds;
  }

  async run(context: AgentContext): Promise<AgentResult> {
    const systemPrompt = this.promptBuilder.build(context);

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      ...context.history.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: context.message.text },
    ];

    const toolCallRecords: ToolCallRecord[] = [];
    const totalTokens = { input: 0, output: 0 };

    for (let round = 0; round < this.maxToolRounds; round++) {
      await this.hookBus.emit("before-llm-call", { messages, round });

      const tools = context.tools.length > 0 ? this.toolRegistry.toLLMTools() : [];
      let response: LLMResponse;
      try {
        response = await this.modelRouter.call(messages, { tools });
        totalTokens.input += response.usage.input;
        totalTokens.output += response.usage.output;
      } catch (error) {
        response = await this.handleError(error, messages, context);
      }

      if (response.stopReason === "end_turn") {
        return {
          text: response.text,
          toolCalls: toolCallRecords,
          tokensUsed: totalTokens,
        };
      }

      if (response.stopReason === "tool_use") {
        messages.push({
          role: "assistant",
          content: response.content,
          ...(response.reasoningContent != null && response.reasoningContent !== "" && { reasoning_content: response.reasoningContent }),
        });

        const toolResults: ToolResultBlock[] = [];
        for (const toolCall of response.toolCalls) {
          const result = await this.toolRegistry.execute(
            toolCall.name,
            toolCall.input,
            {
              userId: context.userId,
              workspaceDir: getUserWorkspace(context.userId),
              sessionId: context.sessionId,
              messageId: context.message.messageId,
            },
          );
          toolCallRecords.push({ ...toolCall, result });
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: truncateResult(result.content, 8000),
          });

          await this.hookBus.emit("after-tool-call", { toolCall, result });
        }

        messages.push({ role: "user", content: toolResults });
      }
    }

    return {
      text: "[GraceBot] 工具调用次数超过限制，已停止执行。",
      toolCalls: toolCallRecords,
      tokensUsed: totalTokens,
    };
  }

  private async handleError(
    error: unknown,
    messages: LLMMessage[],
    context: AgentContext,
  ): Promise<LLMResponse> {
    const tools =
      context.tools.length > 0 ? this.toolRegistry.toLLMTools() : [];

    if (isContextOverflowError(error)) {
      log.warn("Context overflow, compacting...");
      const compacted = await this.compaction.compact(messages);
      messages.length = 0;
      messages.push(...compacted);
      return this.modelRouter.call(messages, { tools });
    }

    if (isRateLimitError(error)) {
      log.warn("Rate limit hit, switching API key...");
      this.modelRouter.markCurrentKeyFailed();
      return this.modelRouter.call(messages, { tools });
    }

    if (isModelUnavailableError(error)) {
      log.warn("Model unavailable, failing over...");
      this.modelRouter.failover();
      return this.modelRouter.call(messages, { tools });
    }

    throw error;
  }
}

function isContextOverflowError(error: unknown): boolean {
  const msg = (error as Error)?.message ?? "";
  return msg.includes("context_length") || msg.includes("max_tokens");
}

function isRateLimitError(error: unknown): boolean {
  const msg = (error as Error)?.message ?? "";
  return msg.includes("rate_limit") || msg.includes("429");
}

function isModelUnavailableError(error: unknown): boolean {
  const msg = (error as Error)?.message ?? "";
  return msg.includes("overloaded") || msg.includes("503");
}

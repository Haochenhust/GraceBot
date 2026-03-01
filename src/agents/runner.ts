import { createLogger } from "../shared/logger.js";
import { startSpan } from "../shared/tracer.js";
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
    const messageId = context.message.messageId;
    const span = startSpan(messageId, "Agent 执行", "agent", {
      userId: context.userId,
      skillNames: context.skills.map((s) => s.name).join(","),
      toolNames: context.tools.map((t) => t.name).join(","),
    });

    try {
      return await this.runInternal(context, messageId);
    } finally {
      span.end();
    }
  }

  private async runInternal(
    context: AgentContext,
    messageId: string,
  ): Promise<AgentResult> {
    const systemPrompt = this.promptBuilder.build(context);

    log.info(
      {
        phase: "agent",
        messageId,
        userId: context.userId,
        skillNames: context.skills.map((s) => s.name),
        toolNames: context.tools.map((t) => t.name),
        systemPromptLen: systemPrompt.length,
      },
      "[flow] agent 开始：system prompt 已构建，进入多轮 LLM",
    );

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

      log.info(
        {
          phase: "agent",
          messageId,
          round,
          stopReason: response.stopReason,
          usage: response.usage,
          textLen: response.text?.length ?? 0,
        },
        "[flow] LLM 本轮返回",
      );

      if (response.stopReason === "end_turn") {
        log.info(
          {
            phase: "agent.done",
            messageId,
            totalTokens,
            toolCallsCount: toolCallRecords.length,
          },
          "[flow] agent 结束：end_turn，返回用户",
        );
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
          const inputPreview =
            typeof toolCall.input === "string"
              ? toolCall.input.slice(0, 200)
              : JSON.stringify(toolCall.input).slice(0, 200);
          const toolSpan = startSpan(
            messageId,
            `工具: ${toolCall.name}`,
            "agent.tool",
            { toolName: toolCall.name, round },
          );
          let result: { content: string };
          let toolErr: Error | undefined;
          try {
            result = await this.toolRegistry.execute(
              toolCall.name,
              toolCall.input,
              {
                userId: context.userId,
                workspaceDir: getUserWorkspace(context.userId),
                sessionId: context.sessionId,
                messageId: context.message.messageId,
              },
            );
          } catch (e) {
            toolErr = e instanceof Error ? e : new Error(String(e));
            log.error(
              {
                phase: "agent.tool",
                messageId,
                toolName: toolCall.name,
                inputPreview,
                error: toolErr.message,
                stack: toolErr.stack,
                err: e,
              },
              "[flow] 工具执行失败",
            );
            result = { content: `[Tool error] ${toolErr.message}` };
          } finally {
            toolSpan.end(toolErr);
          }
          toolCallRecords.push({ ...toolCall, result });
          const resultPreview = result.content.slice(0, 300);
          log.info(
            {
              phase: "agent.tool",
              messageId,
              round,
              toolName: toolCall.name,
              inputPreview: inputPreview + (inputPreview.length >= 200 ? "…" : ""),
              resultPreview: resultPreview + (result.content.length > 300 ? "…" : ""),
            },
            "[flow] 工具调用完成",
          );
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

    log.warn(
      { phase: "agent", messageId, maxRounds: this.maxToolRounds },
      "[flow] agent 达到最大轮次，停止",
    );
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
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    const tools =
      context.tools.length > 0 ? this.toolRegistry.toLLMTools() : [];

    if (isContextOverflowError(error)) {
      log.warn(
        {
          phase: "agent",
          messageId: context.message.messageId,
          error: errMsg,
          stack: errStack,
        },
        "[flow] LLM 调用失败：context 超长，执行 compaction 后重试",
      );
      const compacted = await this.compaction.compact(messages);
      messages.length = 0;
      messages.push(...compacted);
      return this.modelRouter.call(messages, { tools });
    }

    if (isRateLimitError(error)) {
      log.warn(
        {
          phase: "agent",
          messageId: context.message.messageId,
          error: errMsg,
          stack: errStack,
        },
        "[flow] LLM 调用失败：限流，切换 API key 后重试",
      );
      this.modelRouter.markCurrentKeyFailed();
      return this.modelRouter.call(messages, { tools });
    }

    if (isModelUnavailableError(error)) {
      log.warn(
        {
          phase: "agent",
          messageId: context.message.messageId,
          error: errMsg,
          stack: errStack,
        },
        "[flow] LLM 调用失败：模型不可用，failover 后重试",
      );
      this.modelRouter.failover();
      return this.modelRouter.call(messages, { tools });
    }

    log.error(
      {
        phase: "agent",
        messageId: context.message.messageId,
        userId: context.userId,
        error: errMsg,
        stack: errStack,
        err: error,
      },
      "[flow] LLM 调用失败，无法恢复，向上抛出",
    );
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

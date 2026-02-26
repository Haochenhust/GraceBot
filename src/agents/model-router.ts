import { createLogger } from "../shared/logger.js";
import type {
  AuthProfile,
  ContentBlock,
  LLMMessage,
  LLMResponse,
  LLMToolSchema,
} from "../shared/types.js";

const log = createLogger("model-router");

const KIMI_BASE = "https://api.moonshot.cn/v1";

export class ModelRouter {
  private profiles: AuthProfile[];
  private currentProfileIndex = 0;
  private failedProfiles = new Map<string, { until: number }>();
  private primaryModel: string;
  private fallbacks: string[];
  private currentModelIndex = 0;

  constructor(config: {
    primary: string;
    fallbacks: string[];
    profiles: AuthProfile[];
  }) {
    this.primaryModel = config.primary;
    this.fallbacks = config.fallbacks;
    this.profiles = config.profiles;
  }

  async call(
    messages: LLMMessage[],
    options?: { model?: string; tools?: LLMToolSchema[] },
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.getCurrentModel();
    const profile = this.selectHealthyProfile(model);

    if (!profile) {
      throw new Error("No healthy API profile available");
    }

    log.debug(
      { model, profile: profile.name },
      "Calling LLM",
    );

    return this.callProvider(profile, model, messages, options?.tools ?? []);
  }

  markCurrentKeyFailed(): void {
    const profile = this.profiles[this.currentProfileIndex];
    if (profile) {
      this.failedProfiles.set(profile.name, {
        until: Date.now() + 60_000,
      });
      log.warn({ profile: profile.name }, "Profile marked as failed (cooldown 60s)");
    }
    this.currentProfileIndex =
      (this.currentProfileIndex + 1) % this.profiles.length;
  }

  failover(): void {
    this.currentModelIndex++;
    const model = this.getCurrentModel();
    log.warn({ model }, "Failing over to next model");
  }

  private getCurrentModel(): string {
    if (this.currentModelIndex === 0) return this.primaryModel;
    const fallbackIdx = this.currentModelIndex - 1;
    if (fallbackIdx < this.fallbacks.length) {
      return this.fallbacks[fallbackIdx];
    }
    return this.primaryModel;
  }

  private selectHealthyProfile(model: string): AuthProfile | null {
    const now = Date.now();
    const wantKimi = model.startsWith("kimi-");

    for (let i = 0; i < this.profiles.length; i++) {
      const idx = (this.currentProfileIndex + i) % this.profiles.length;
      const profile = this.profiles[idx];
      if (wantKimi && profile.provider !== "kimi") continue;
      if (!wantKimi && profile.provider === "kimi") continue;

      const failed = this.failedProfiles.get(profile.name);
      if (!failed || failed.until < now) {
        this.failedProfiles.delete(profile.name);
        this.currentProfileIndex = idx;
        return profile;
      }
    }

    return null;
  }

  private async callProvider(
    profile: AuthProfile,
    model: string,
    messages: LLMMessage[],
    tools: LLMToolSchema[],
  ): Promise<LLMResponse> {
    if (profile.provider === "kimi") {
      return this.callKimi(profile, model, messages, tools);
    }
    throw new Error(`LLM provider "${profile.provider}" not yet implemented`);
  }

  private async callKimi(
    profile: AuthProfile,
    model: string,
    messages: LLMMessage[],
    tools: LLMToolSchema[],
  ): Promise<LLMResponse> {
    const baseUrl = profile.endpoint ?? KIMI_BASE;
    const url = `${baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model,
      messages: toOpenAIMessages(messages),
      max_tokens: 8192,
      temperature: 0.7,
    };
    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }));
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${profile.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason?: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    if (!res.ok) {
      const errMsg =
        (data.error?.message ?? (await res.text())) || `HTTP ${res.status}`;
      throw new Error(errMsg);
    }

    const choice = data.choices?.[0];
    const msg = choice?.message;
    const usage = data.usage ?? {};
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;

    if (!msg) {
      return {
        text: "",
        content: [],
        stopReason: "end_turn",
        toolCalls: [],
        usage: { input: inputTokens, output: outputTokens },
      };
    }

    const toolCalls = (msg.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: parseJSON(tc.function.arguments, {}),
    }));
    const content: ContentBlock[] = toolCalls.length
      ? toolCalls.map((tc) => ({
          type: "tool_use" as const,
          id: tc.id,
          name: tc.name,
          input: tc.input,
        }))
      : [];

    const text = typeof msg.content === "string" ? msg.content : "";
    const finishReason = choice?.finish_reason ?? "stop";
    const stopReason: LLMResponse["stopReason"] =
      finishReason === "tool_calls"
        ? "tool_use"
        : finishReason === "length"
          ? "max_tokens"
          : "end_turn";

    log.info(
      {
        model,
        stopReason,
        textLen: text.length,
        toolCallsCount: toolCalls.length,
        inputTokens,
        outputTokens,
      },
      "Kimi response received",
    );

    return {
      text,
      content,
      stopReason,
      toolCalls,
      usage: { input: inputTokens, output: outputTokens },
    };
  }
}

function toOpenAIMessages(messages: LLMMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: m.content };
    }
    const blocks = m.content as ContentBlock[];
    const toolResults = blocks.filter((b): b is ContentBlock & { type: "tool_result" } => b.type === "tool_result");
    const toolUses = blocks.filter((b): b is ContentBlock & { type: "tool_use" } => b.type === "tool_use");
    const textBlock = blocks.find((b): b is ContentBlock & { type: "text" } => b.type === "text");

    if (m.role === "user" && toolResults.length > 0) {
      return {
        role: "user",
        content: toolResults.map((r) => ({
          type: "tool_result",
          tool_use_id: r.tool_use_id,
          content: r.content,
        })),
      };
    }
    if (m.role === "assistant" && toolUses.length > 0) {
      return {
        role: "assistant",
        content: textBlock?.text ?? null,
        tool_calls: toolUses.map((u) => ({
          id: u.id,
          type: "function",
          function: { name: u.name, arguments: JSON.stringify(u.input) },
        })),
      };
    }
    const text = textBlock?.text ?? (blocks as { text?: string }[]).find((b) => b.text)?.text ?? "";
    return { role: m.role, content: text || null };
  });
}

function parseJSON<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

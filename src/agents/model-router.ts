import { createLogger } from "../shared/logger.js";
import type {
  AuthProfile,
  ContentBlock,
  LLMMessage,
  LLMResponse,
  LLMToolSchema,
} from "../shared/types.js";

const log = createLogger("model-router");

// Default base URLs
const PROVIDER_DEFAULTS: Record<string, string> = {
  kimi: "https://api.moonshot.cn/v1",
  openai: "https://api.openai.com/v1",
  volcengine: "https://ark.cn-beijing.volces.com/api/v3",
  anthropic: "https://api.anthropic.com",
};

const ANTHROPIC_VERSION = "2023-06-01";

/** Map a model name prefix to its provider type */
function inferProvider(model: string): AuthProfile["provider"] | null {
  if (model.startsWith("kimi-")) return "kimi";
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3")) return "openai";
  if (model.startsWith("doubao-") || model.startsWith("ep-")) return "volcengine";
  return null;
}

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
      throw new Error(`No healthy API profile available for model "${model}"`);
    }

    log.debug({ model, profile: profile.name, provider: profile.provider }, "Calling LLM");

    return this.callProvider(profile, model, messages, options?.tools ?? []);
  }

  markCurrentKeyFailed(): void {
    const profile = this.profiles[this.currentProfileIndex];
    if (profile) {
      this.failedProfiles.set(profile.name, { until: Date.now() + 60_000 });
      log.warn({ profile: profile.name }, "Profile marked as failed (cooldown 60s)");
    }
    this.currentProfileIndex = (this.currentProfileIndex + 1) % this.profiles.length;
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
    const wantProvider = inferProvider(model);

    for (let i = 0; i < this.profiles.length; i++) {
      const idx = (this.currentProfileIndex + i) % this.profiles.length;
      const profile = this.profiles[idx];

      // Match provider by model prefix, or fall through to first healthy profile
      if (wantProvider && profile.provider !== wantProvider) continue;

      const failed = this.failedProfiles.get(profile.name);
      if (!failed || failed.until < now) {
        this.failedProfiles.delete(profile.name);
        this.currentProfileIndex = idx;
        return profile;
      }
    }

    // No exact match — try any healthy profile as fallback
    if (wantProvider) {
      for (let i = 0; i < this.profiles.length; i++) {
        const idx = (this.currentProfileIndex + i) % this.profiles.length;
        const profile = this.profiles[idx];
        const failed = this.failedProfiles.get(profile.name);
        if (!failed || failed.until < now) {
          log.warn({ model, fallbackProfile: profile.name }, "No matching provider, using first healthy profile");
          this.currentProfileIndex = idx;
          return profile;
        }
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
    switch (profile.provider) {
      case "anthropic":
        return this.callAnthropic(profile, model, messages, tools);
      case "kimi":
      case "openai":
      case "volcengine":
        return this.callOpenAICompatible(profile, model, messages, tools);
      default:
        throw new Error(`Unsupported provider: ${String(profile.provider)}`);
    }
  }

  // ─── OpenAI-compatible (Kimi / OpenAI / Volcengine) ──────────────────────

  private async callOpenAICompatible(
    profile: AuthProfile,
    model: string,
    messages: LLMMessage[],
    tools: LLMToolSchema[],
  ): Promise<LLMResponse> {
    const baseUrl = (profile.endpoint ?? PROVIDER_DEFAULTS[profile.provider] ?? PROVIDER_DEFAULTS.openai).replace(/\/$/, "");
    const url = `${baseUrl}/chat/completions`;

    let outMessages: Array<Record<string, unknown>> = toOpenAIMessages(messages);

    // Kimi K2.5: temperature=1 only; thinking model requires reasoning_content on every assistant message that has tool_calls (non-empty)
    if (profile.provider === "kimi") {
      outMessages = outMessages.map((msg) => {
        if (msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
          const hasReasoning = msg.reasoning_content !== undefined && msg.reasoning_content !== null && String(msg.reasoning_content).trim() !== "";
          return { ...msg, reasoning_content: hasReasoning ? msg.reasoning_content : " " };
        }
        return msg;
      });
    }

    const body: Record<string, unknown> = {
      model,
      messages: outMessages,
      max_tokens: 8192,
    };

    if (profile.provider === "kimi") {
      body.temperature = 1;
    }

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

    let data: {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
          reasoning_content?: string | null;
        };
        finish_reason?: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    try {
      data = (await res.json()) as typeof data;
    } catch {
      throw new Error(`HTTP ${res.status}: failed to parse response`);
    }

    if (!res.ok) {
      const errMsg = data.error?.message || `HTTP ${res.status}`;
      throw new Error(errMsg);
    }

    const choice = data.choices?.[0];
    const msg = choice?.message;
    const usage = data.usage ?? {};
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;

    if (!msg) {
      return { text: "", content: [], stopReason: "end_turn", toolCalls: [], usage: { input: inputTokens, output: outputTokens } };
    }

    const toolCalls = (msg.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: parseJSON(tc.function.arguments, {}),
    }));
    const content: ContentBlock[] = toolCalls.map((tc) => ({
      type: "tool_use" as const,
      id: tc.id,
      name: tc.name,
      input: tc.input,
    }));

    const text = typeof msg.content === "string" ? msg.content : "";
    const reasoningContent = typeof msg.reasoning_content === "string" ? msg.reasoning_content : undefined;
    const finishReason = choice?.finish_reason ?? "stop";
    const stopReason: LLMResponse["stopReason"] =
      finishReason === "tool_calls" ? "tool_use"
      : finishReason === "length" ? "max_tokens"
      : "end_turn";

    log.info({ model, provider: profile.provider, stopReason, textLen: text.length, toolCallsCount: toolCalls.length, inputTokens, outputTokens }, "LLM response");

    return { text, content, stopReason, toolCalls, usage: { input: inputTokens, output: outputTokens }, reasoningContent };
  }

  // ─── Anthropic ────────────────────────────────────────────────────────────

  private async callAnthropic(
    profile: AuthProfile,
    model: string,
    messages: LLMMessage[],
    tools: LLMToolSchema[],
  ): Promise<LLMResponse> {
    const baseUrl = (profile.endpoint ?? PROVIDER_DEFAULTS.anthropic).replace(/\/$/, "");
    const url = `${baseUrl}/v1/messages`;

    // Separate system message from conversation
    const systemMsg = messages.find((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model,
      max_tokens: 8192,
      messages: toAnthropicMessages(conversationMessages),
    };

    if (systemMsg) {
      body.system = typeof systemMsg.content === "string" ? systemMsg.content : "";
    }

    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }));
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": profile.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });

    let data: {
      id?: string;
      content?: Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: unknown }
      >;
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
      error?: { message?: string };
    };

    try {
      data = (await res.json()) as typeof data;
    } catch {
      throw new Error(`HTTP ${res.status}: failed to parse Anthropic response`);
    }

    if (!res.ok) {
      const errMsg = data.error?.message || `HTTP ${res.status}`;
      throw new Error(errMsg);
    }

    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const rawContent = data.content ?? [];

    const textContent = rawContent.find((b): b is { type: "text"; text: string } => b.type === "text");
    const text = textContent?.text ?? "";

    const toolCalls = rawContent
      .filter((b): b is { type: "tool_use"; id: string; name: string; input: unknown } => b.type === "tool_use")
      .map((tc) => ({ id: tc.id, name: tc.name, input: tc.input }));

    const content: ContentBlock[] = rawContent.map((b) => {
      if (b.type === "text") return { type: "text" as const, text: b.text };
      return { type: "tool_use" as const, id: b.id, name: b.name, input: b.input };
    });

    const stopReason: LLMResponse["stopReason"] =
      data.stop_reason === "tool_use" ? "tool_use"
      : data.stop_reason === "max_tokens" ? "max_tokens"
      : "end_turn";

    log.info({ model, provider: "anthropic", stopReason, textLen: text.length, toolCallsCount: toolCalls.length, inputTokens, outputTokens }, "Anthropic response");

    return { text, content, stopReason, toolCalls, usage: { input: inputTokens, output: outputTokens } };
  }
}

// ─── Message format converters ─────────────────────────────────────────────

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
        role: "tool",
        tool_call_id: toolResults[0].tool_use_id,
        content: toolResults.map((r) => r.content).join("\n"),
      };
    }
    if (m.role === "assistant" && toolUses.length > 0) {
      const out: Record<string, unknown> = {
        role: "assistant",
        content: textBlock?.text ?? null,
        tool_calls: toolUses.map((u) => ({
          id: u.id,
          type: "function",
          function: { name: u.name, arguments: JSON.stringify(u.input) },
        })),
      };
      if (m.reasoning_content !== undefined && m.reasoning_content !== null) {
        out.reasoning_content = m.reasoning_content;
      }
      return out;
    }
    const text = textBlock?.text ?? (blocks as { text?: string }[]).find((b) => b.text)?.text ?? "";
    return { role: m.role, content: text || null };
  });
}

function toAnthropicMessages(messages: LLMMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: m.content };
    }
    const blocks = m.content as ContentBlock[];

    if (m.role === "user") {
      const toolResults = blocks.filter((b): b is ContentBlock & { type: "tool_result" } => b.type === "tool_result");
      if (toolResults.length > 0) {
        return {
          role: "user",
          content: toolResults.map((r) => ({
            type: "tool_result",
            tool_use_id: r.tool_use_id,
            content: r.content,
          })),
        };
      }
    }

    if (m.role === "assistant") {
      const toolUses = blocks.filter((b): b is ContentBlock & { type: "tool_use" } => b.type === "tool_use");
      const textBlock = blocks.find((b): b is ContentBlock & { type: "text" } => b.type === "text");
      const content: unknown[] = [];
      if (textBlock) content.push({ type: "text", text: textBlock.text });
      for (const tu of toolUses) {
        content.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
      }
      return { role: "assistant", content };
    }

    const textBlock = blocks.find((b): b is ContentBlock & { type: "text" } => b.type === "text");
    return { role: m.role, content: textBlock?.text ?? "" };
  });
}

function parseJSON<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

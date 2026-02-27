// ─── Unified Message (Gateway → Kernel) ───

export interface Mention {
  id: string;
  name: string;
  isBot: boolean;
}

export interface Attachment {
  type: "image" | "file";
  key: string;
  name?: string;
}

export interface UnifiedMessage {
  messageId: string;
  userId: string;
  chatId: string;
  chatType: "p2p" | "group";
  text: string;
  /** 话题根消息 ID（用户在回复某条消息时由飞书事件提供） */
  rootId?: string;
  /** 被直接回复的消息 ID */
  parentId?: string;
  mentions?: Mention[];
  attachments?: Attachment[];
  timestamp: number;
}

// ─── Session（按话题维度：同一话题内多轮对话共享一个 Session） ───

export interface Session {
  id: string;
  userId: string;
  /** 会话所在群聊/单聊 ID */
  chatId: string;
  /** 话题根消息 ID（飞书 Thread 的 root_id；新话题时为首条消息的 message_id） */
  rootId: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface HistoryMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentBlock[];
  timestamp: number;
}

// ─── Agent ───

export interface AgentContext {
  userId: string;
  message: UnifiedMessage;
  history: HistoryMessage[];
  soul: string | null;
  userProfile: string | null;
  skills: Skill[];
  memories: MemoryEntry[];
  tools: ToolDefinition[];
}

export interface AgentResult {
  text: string;
  toolCalls: ToolCallRecord[];
  tokensUsed: { input: number; output: number };
}

export interface AgentTask {
  type: "agent-task";
  userId: string;
  message: UnifiedMessage;
  session: Session;
  priority?: "high" | "normal" | "low";
}

// ─── LLM ───

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentBlock[];
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface LLMResponse {
  text: string;
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  toolCalls: ToolCall[];
  usage: { input: number; output: number };
}

export interface LLMToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// ─── Tools ───

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(params: unknown, context: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  userId: string;
  workspaceDir: string;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolCallRecord extends ToolCall {
  result: ToolResult;
}

export type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

// ─── Memory ───

export interface MemoryEntry {
  id: string;
  userId: string;
  content: string;
  category: "preference" | "fact" | "event" | "skill";
  importance: number;
  createdAt: string;
  source: {
    sessionId: string;
    messageId: string;
  };
}

export interface VectorEntry {
  id: string;
  vector: number[];
}

// ─── Skills ───

export interface Skill {
  name: string;
  content: string;
  source: "global" | "user";
}

// ─── Plugins ───

export interface GraceBotPlugin {
  name: string;
  version: string;
  tools?: ToolDefinition[];
  hooks?: Partial<PluginHooks>;
  routes?: PluginRoute[];
  cron?: CronJob[];
}

export interface PluginHooks {
  "on-message": (ctx: MessageHookContext) => Promise<HookResult>;
  "before-agent": (ctx: AgentHookContext) => Promise<void>;
  "before-llm-call": (ctx: LLMCallHookContext) => Promise<void>;
  "after-tool-call": (ctx: ToolCallHookContext) => Promise<void>;
  "after-agent": (ctx: AgentResultHookContext) => Promise<void>;
  "on-error": (ctx: ErrorHookContext) => Promise<void>;
}

export interface PluginRoute {
  method: "GET" | "POST";
  path: string;
  handler: (c: unknown) => Promise<Response>;
}

export interface CronJob {
  schedule: string;
  handler: () => Promise<void>;
}

// ─── Hook Contexts ───

export interface HookResult {
  intercepted?: boolean;
}

export interface MessageHookContext {
  message: UnifiedMessage;
}

export interface AgentHookContext {
  userId: string;
  context: AgentContext;
}

export interface LLMCallHookContext {
  messages: LLMMessage[];
  round: number;
}

export interface ToolCallHookContext {
  toolCall: ToolCall;
  result: ToolResult;
}

export interface AgentResultHookContext {
  userId: string;
  message: UnifiedMessage;
  result: AgentResult;
}

export interface ErrorHookContext {
  error: unknown;
  userId?: string;
}

// ─── Config ───

export interface AppConfig {
  server: {
    port: number;
  };
  feishu: {
    app_id: string;
    app_secret: string;
    verification_token: string;
    encrypt_key: string;
  };
  models: {
    primary: string;
    fallbacks: string[];
    profiles: AuthProfile[];
    compaction_model: string;
    reflection_model: string;
  };
  agent: {
    max_tool_rounds: number;
    session_timeout_minutes: number;
  };
  queue: {
    concurrency: number;
    retries: number;
  };
}

export interface AuthProfile {
  name: string;
  provider: "anthropic" | "openai" | "volcengine" | "kimi";
  apiKey: string;
  endpoint?: string;
}

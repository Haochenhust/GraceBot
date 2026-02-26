# OpenClaw 架构深度分析
> 面向 Agent 开发工程师的设计思路解析，用于复刻与自研参考

---

## 目录

1. [项目定位与设计哲学](#1-项目定位与设计哲学)
2. [整体架构全景](#2-整体架构全景)
3. [核心模块拆解](#3-核心模块拆解)
   - [3.1 Gateway — 控制平面](#31-gateway--控制平面)
   - [3.2 Agent Runner — 执行引擎](#32-agent-runner--执行引擎)
   - [3.3 Tool System — 工具体系](#33-tool-system--工具体系)
   - [3.4 Channel System — 消息渠道](#34-channel-system--消息渠道)
   - [3.5 Plugin System — 插件机制](#35-plugin-system--插件机制)
   - [3.6 Skills System — 技能系统](#36-skills-system--技能系统)
   - [3.7 Memory System — 记忆系统](#37-memory-system--记忆系统)
   - [3.8 Multi-Model — 多模型管理](#38-multi-model--多模型管理)
   - [3.9 Subagent System — 子 Agent 系统](#39-subagent-system--子-agent-系统)
4. [关键数据流](#4-关键数据流)
5. [安全设计](#5-安全设计)
6. [技术选型分析](#6-技术选型分析)
7. [复刻路线图](#7-复刻路线图)

---

## 1. 项目定位与设计哲学

### 核心定位

OpenClaw 是一个**个人 AI 助理网关**，它的核心价值主张是：

- **运行在你自己的设备上**（self-hosted，不依赖云端）
- **接入你已有的渠道**（WhatsApp、Telegram、Slack、Discord、iMessage 等）
- **执行真实任务**（不只是聊天，而是操作文件、浏览器、执行代码）

### 设计哲学（来自 VISION.md）

| 原则 | 具体体现 |
|------|----------|
| **安全优先** | 工具调用需审批，沙箱隔离，本地信任分级 |
| **保持核心精简** | 可选能力通过插件扩展，core 不膨胀 |
| **可黑客化** | TypeScript 编写，易于阅读/修改/扩展 |
| **终端优先** | 配置显式，用户看得见安全决策 |
| **一网关多渠道** | 单进程管理所有消息平台，避免多实例混乱 |

### 为什么选 TypeScript？

> "OpenClaw is primarily an orchestration system: prompts, tools, protocols, and integrations. TypeScript was chosen to keep OpenClaw hackable by default. It is widely known, fast to iterate in, and easy to read, modify, and extend."

本质上，OpenClaw 是个**编排系统**（Orchestration），不是底层 AI 框架，所以选择开发效率高、生态丰富的 TypeScript 而非 Python。

---

## 2. 整体架构全景

```mermaid
graph TB
    subgraph Clients["客户端层"]
        CLI["CLI 命令行"]
        WebUI["Web UI (Control Panel)"]
        macOS["macOS App"]
        iOS["iOS App"]
    end

    subgraph Gateway["Gateway 守护进程 (核心)"]
        WS["WebSocket 服务器\n:18789"]
        HTTP["HTTP 服务器\n控制面板 + WebChat"]
        ChannelMgr["渠道管理器\nChannelManager"]
        AgentRunner["Agent 执行器\nPiEmbeddedRunner"]
        PluginMgr["插件管理器"]
        CronSched["Cron 调度器"]
        MemoryMgr["记忆管理器"]
    end

    subgraph Channels["消息渠道"]
        WA["WhatsApp\n(Baileys)"]
        TG["Telegram\n(grammY)"]
        Slack["Slack\n(Bolt)"]
        Discord["Discord"]
        iMsg["iMessage\n(BlueBubbles)"]
        WebChat["WebChat"]
    end

    subgraph Models["模型提供商"]
        Anthropic["Anthropic Claude"]
        OpenAI["OpenAI GPT/o-series"]
        Gemini["Google Gemini"]
        Others["Ollama / 本地模型..."]
    end

    subgraph Tools["工具层"]
        BashTool["exec (Shell)"]
        BrowserTool["browser (Playwright)"]
        FSTool["read/write/edit"]
        WebTool["web-search / web-fetch"]
        MemTool["memory"]
        SubAgentTool["sessions-spawn (子Agent)"]
        MsgTool["message (发消息)"]
    end

    subgraph Nodes["节点 (Nodes)"]
        MacNode["macOS Node\n相机/屏幕/Canvas"]
        MobileNode["iOS/Android Node"]
    end

    CLI -->|"WebSocket req:agent"| WS
    WebUI -->|"WebSocket"| WS
    macOS -->|"WebSocket"| WS
    iOS -->|"WebSocket role:node"| WS

    WS --> Gateway
    HTTP --> Gateway
    ChannelMgr --> WA
    ChannelMgr --> TG
    ChannelMgr --> Slack
    ChannelMgr --> Discord
    ChannelMgr --> iMsg
    ChannelMgr --> WebChat

    AgentRunner -->|"API Call"| Models
    AgentRunner -->|"Tool Call"| Tools
    PluginMgr --> AgentRunner
    CronSched --> AgentRunner
    MemoryMgr --> MemTool

    MacNode -->|"WebSocket role:node"| WS
    MobileNode -->|"WebSocket role:node"| WS
```

### 核心设计决策：一个 Gateway 掌管一切

```mermaid
graph LR
    A["❌ 传统方案\n每个渠道独立 Bot 进程"] --> B["管理混乱\n状态分散\n难以统一"]
    C["✅ OpenClaw 方案\n单一 Gateway 统一管理"] --> D["统一认证\n统一会话\n统一路由"]
```

**好处**：
- 跨渠道统一身份（同一条消息可以从 WhatsApp 发，从 Telegram 看回复）
- 单点配置、单点鉴权
- 避免多个 WhatsApp Session 的竞争问题

---

## 3. 核心模块拆解

### 3.1 Gateway — 控制平面

**文件**：`src/gateway/server.impl.ts`

Gateway 是整个系统的**大脑和路由器**，负责：

1. 接受 WebSocket 连接（CLI、Web、macOS App、Node 设备）
2. 管理消息渠道的生命周期
3. 接收 `req:agent` 请求，派发给 Agent Runner
4. 将 Agent 流式结果通过 WebSocket 推回给客户端
5. 管理 Cron 定时任务

#### WebSocket 通信协议

```mermaid
sequenceDiagram
    participant Client as 客户端 (CLI/App)
    participant Gateway as Gateway

    Note over Client,Gateway: 1. 握手建连
    Client->>Gateway: req:connect { auth.token, deviceId }
    Gateway-->>Client: res (ok) + hello-ok snapshot

    Note over Client,Gateway: 2. 订阅推送
    Gateway-->>Client: event:presence (在线状态)
    Gateway-->>Client: event:tick (心跳)

    Note over Client,Gateway: 3. 发起 Agent 任务
    Client->>Gateway: req:agent { message, idempotencyKey }
    Gateway-->>Client: res:agent (ack) { runId, status:"accepted" }

    Note over Client,Gateway: 4. 流式返回结果
    Gateway-->>Client: event:agent (streaming text chunks)
    Gateway-->>Client: event:agent (tool_call start)
    Gateway-->>Client: event:agent (tool_call result)
    Gateway-->>Client: event:agent (final result)
```

#### 协议消息格式

```typescript
// 请求格式
{ type: "req", id: "uuid", method: "agent", params: {...} }

// 响应格式
{ type: "res", id: "uuid", ok: true, payload: {...} }
{ type: "res", id: "uuid", ok: false, error: {...} }

// 服务器推送事件
{ type: "event", event: "agent", payload: {...}, seq: 42 }
```

#### Node 设备连接

**Nodes**（macOS/iOS/Android）是一类特殊客户端，连接时声明 `role: node`，可以提供额外能力：

```typescript
// Node 连接时的 caps 声明
{
  role: "node",
  caps: ["canvas.*", "camera.*", "screen.record", "location.get"],
  commands: [...],
  permissions: [...]
}
```

### 3.2 Agent Runner — 执行引擎

**文件**：`src/agents/pi-embedded-runner/run.ts` + `run/attempt.ts`

这是整个系统最核心的部分——**Agent 的 ReAct 循环**。

#### Agent 执行流程

```mermaid
flowchart TD
    A["收到 req:agent 请求"] --> B["resolveModel\n选择模型+认证配置"]
    B --> C["buildEmbeddedRunPayloads\n构建 system prompt + 历史消息"]
    C --> D["runEmbeddedAttempt\n执行一次 LLM 调用"]
    D --> E{LLM 返回什么?}

    E -->|"纯文本回复"| F["流式输出给用户\n结束"]
    E -->|"工具调用 Tool Call"| G["执行工具\n得到结果"]
    G --> H["将工具结果追加到历史"]
    H --> D

    D -->|"发生错误"| I{错误类型?}
    I -->|"认证失败 / Rate Limit"| J["markAuthProfileFailure\n切换到下一个认证配置"]
    J --> B
    I -->|"上下文超长"| K["compactSession\n压缩历史摘要"]
    K --> D
    I -->|"模型不可用"| L["resolveFailoverStatus\n切换到备用模型"]
    L --> B
    I -->|"无法恢复"| M["返回错误给用户"]
```

#### 关键设计：多层容错

```mermaid
graph TD
    A["模型调用失败"] --> B{分类失败原因}
    B --> |"Rate Limit"| C["Auth Profile 冷却\n轮转到下一个 API Key"]
    B --> |"Context Overflow"| D["触发 Compaction\n用 LLM 压缩历史记录"]
    B --> |"Auth Error"| E["标记该 Profile 失败\n尝试下一个"]
    B --> |"Model Unavailable"| F["Failover 到备用模型\n如 claude-3-5-sonnet → claude-3-haiku"]
    B --> |"Billing Error"| G["格式化友好错误\n提示用户充值"]
```

#### System Prompt 构建

```mermaid
graph LR
    A["系统提示构建"] --> B["基础 Identity\n(角色/名字/日期)"]
    A --> C["Skills Prompt\n(用户定义的技能描述)"]
    A --> D["Tool Catalog\n(可用工具列表)"]
    A --> E["Bootstrap Files\n(工作区上下文文件)"]
    A --> F["Sandbox Info\n(沙箱路径/限制)"]
    B & C & D & E & F --> G["最终 System Prompt"]
```

### 3.3 Tool System — 工具体系

**文件**：`src/agents/tools/` + `src/agents/tool-catalog.ts`

OpenClaw 的工具体系设计非常系统化，分为**工具定义**、**工具目录**、**工具策略**三层。

#### 工具分类（11 个 Section）

```mermaid
mindmap
  root((Tools))
    Files/文件系统
      read
      write
      edit
      apply_patch
    Runtime/运行时
      exec (Shell命令)
      process (后台进程)
    Web/网络
      web_search
      web_fetch
    Memory/记忆
      memory_search
      memory_write
    Sessions/会话
      sessions_spawn (生成子Agent)
      sessions_list
      sessions_send
    UI/界面
      canvas (Canvas操控)
    Messaging/消息
      message_send (发消息到渠道)
    Automation/自动化
      cron (定时任务)
    Nodes/节点
      node_invoke (调用Node能力)
    Agents/Agent
      agents_list
    Media/媒体
      tts (语音合成)
      image_generate
```

#### 工具策略（Tool Policy）

**文件**：`src/agents/tool-policy.ts`

```typescript
// 工具配置文件 (ToolProfileId)
type ToolProfileId = "minimal" | "coding" | "messaging" | "full"

// 每个 Profile 对应不同工具集
// minimal: 最少工具，适合简单问答
// coding:  文件系统 + 运行时 + Web
// messaging: 消息发送相关
// full:    全部工具
```

工具策略支持：
- **允许列表/拒绝列表**：精细控制哪些工具可用
- **分组**：`group:plugins`（所有插件工具）、`group:openclaw`（核心工具）
- **Owner-only**：某些高危工具只有 owner 用户可用
- **动态启用**：根据配置和用户权限动态调整

#### exec 工具（Shell 执行）的安全设计

```mermaid
flowchart LR
    A["Agent 请求执行\nexec('rm -rf /tmp')"] --> B["ExecApprovalManager\n审批管理器"]
    B --> C{需要审批?}
    C -->|"高危命令"| D["向用户发送审批请求\n等待确认"]
    D -->|"用户批准"| E["执行命令\n返回结果"]
    D -->|"用户拒绝"| F["返回拒绝错误"]
    C -->|"已在允许列表"| E
    C -->|"沙箱模式"| G["在 Docker 沙箱中执行"]
    G --> E
```

### 3.4 Channel System — 消息渠道

**文件**：`src/channels/` + `src/gateway/server-channels.ts`

每个消息渠道都是一个**插件化的渠道适配器**。

#### 渠道适配器模式

```mermaid
classDiagram
    class ChannelPlugin {
        <<interface>>
        +name: string
        +connect(): Promise~void~
        +disconnect(): Promise~void~
        +onMessage(handler): void
        +sendMessage(target, text): Promise~void~
        +sendTyping(target): Promise~void~
    }

    class TelegramPlugin {
        -bot: Bot (grammY)
        +connect()
        +onMessage()
        +sendMessage()
    }

    class WhatsAppPlugin {
        -sock: WASocket (Baileys)
        +connect()
        +onMessage()
        +sendMessage()
    }

    class SlackPlugin {
        -app: App (Bolt)
        +connect()
        +onMessage()
        +sendMessage()
    }

    ChannelPlugin <|.. TelegramPlugin
    ChannelPlugin <|.. WhatsAppPlugin
    ChannelPlugin <|.. SlackPlugin
```

#### 消息路由流程

```mermaid
sequenceDiagram
    participant User as 用户 (WhatsApp)
    participant WA as WhatsApp Channel
    participant Gateway
    participant Agent as Agent Runner
    participant LLM as Claude/GPT

    User->>WA: 发送消息 "帮我查一下天气"
    WA->>Gateway: 触发 onMessage 回调
    Gateway->>Gateway: 识别用户身份 + 会话路由
    Gateway->>Agent: req:agent { message, sessionKey, channel }
    Agent->>LLM: API Call (含历史+工具列表)
    LLM-->>Agent: 调用 web_search 工具
    Agent->>Agent: 执行 web_search
    Agent->>LLM: 携带搜索结果继续
    LLM-->>Agent: 生成最终回复
    Agent-->>Gateway: 流式回复文本
    Gateway->>WA: sendMessage
    WA->>User: 回复消息
```

### 3.5 Plugin System — 插件机制

**文件**：`src/plugins/`

OpenClaw 的插件系统是**扩展能力而不膨胀 core** 的关键设计。

#### 插件 Hook 系统

```mermaid
graph TD
    subgraph Plugin["插件可以 Hook 的生命周期节点"]
        H1["before-agent-start\nAgent 启动前"]
        H2["after-tool-call\n工具调用后"]
        H3["on-message\n收到消息时"]
        H4["on-llm-response\nLLM 返回时"]
        H5["on-compaction\n触发压缩时"]
        H6["on-session-start/end\n会话开始/结束"]
        H7["model-override\n覆盖模型选择"]
    end

    Plugin --> Core["Core 执行流程"]
```

#### 插件能力范围

| 能力 | 说明 |
|------|------|
| 注册新工具 | 插件可以向 Agent 注册新的 Tool |
| 注册 CLI 命令 | 扩展 `openclaw` 命令行 |
| 注册 HTTP 端点 | 暴露自己的 API |
| Hook 生命周期 | 在关键节点插入自定义逻辑 |
| 注册 Gateway 方法 | 扩展 WebSocket 协议方法 |

#### 插件开发结构

```typescript
// 一个典型的 OpenClaw 插件
export default {
  name: "my-plugin",
  version: "1.0.0",

  // 注册工具
  tools: [
    {
      name: "my_custom_tool",
      description: "...",
      parameters: { /* JSON Schema */ },
      execute: async (params) => { /* 实现 */ }
    }
  ],

  // Hook 生命周期
  hooks: {
    "before-agent-start": async (ctx) => {
      // 在 Agent 启动前做点什么
    },
    "after-tool-call": async (ctx) => {
      // 工具调用后
    }
  },

  // 注册 HTTP 端点
  httpRoutes: [
    { method: "GET", path: "/my-endpoint", handler: async (req, res) => {} }
  ]
}
```

### 3.6 Skills System — 技能系统

**文件**：`src/agents/skills/`

Skills 是一种**可动态加载的 Prompt 增强机制**，本质是 Markdown 文件，注入到 System Prompt 中。

#### Skills 层级

```mermaid
graph TD
    A["Skills 优先级 (高→低)"] --> B["Workspace Skills\n项目目录下的 .openclaw/skills/"]
    B --> C["Managed Skills\n通过 clawhub.ai 安装"]
    C --> D["Bundled Skills\n内置默认技能"]
```

#### Skills 工作原理

```
SKILLS_DIR/
├── coding.md        # 编程相关技能描述
├── web-research.md  # 网页研究技能
└── custom.md        # 用户自定义

↓ 构建 System Prompt 时

[System Prompt]
...
## Skills
### coding
你擅长编写干净、可维护的代码...

### web-research
当用户询问需要查找信息的问题时...
```

### 3.7 Memory System — 记忆系统

**文件**：`src/agents/memory-search.ts` + `src/agents/tools/memory-tool.ts`

OpenClaw 的记忆系统是**单插槽设计**——同时只能启用一个记忆插件。

```mermaid
graph LR
    A["用户对话"] -->|"Agent 判断值得记住"| B["memory_write 工具调用"]
    B --> C["记忆后端\n(向量数据库/文件)"]

    D["新对话开始"] --> E["memory_search 工具调用"]
    E -->|"语义搜索"| C
    C -->|"返回相关记忆"| F["注入到上下文"]
    F --> G["Agent 带着记忆回复"]
```

支持的记忆后端（通过插件）：
- **文件系统**：本地 JSON/向量文件（内置默认）
- **向量数据库**：通过插件扩展（如 Qdrant、Chroma）

### 3.8 Multi-Model — 多模型管理

**文件**：`src/agents/model-auth.ts` + `src/agents/model-fallback.ts` + `src/agents/auth-profiles.ts`

这是 OpenClaw 中非常精心设计的一个模块，解决了**多 API Key 轮转 + 模型故障转移**的问题。

#### Auth Profile 轮转机制

```mermaid
stateDiagram-v2
    [*] --> Active: 初始化
    Active --> Cooldown: Rate Limit / Auth Error
    Cooldown --> Active: 冷却时间结束
    Active --> Blacklisted: 多次失败
    Blacklisted --> Active: 手动重置

    note right of Cooldown
        自动等待冷却时间
        期间使用其他 Profile
    end note
```

#### 模型故障转移链

```mermaid
graph LR
    A["主模型\nclaude-opus-4"] -->|"不可用"| B["备用模型\nclaude-sonnet-4"]
    B -->|"不可用"| C["备用模型\nclaude-haiku-3-5"]
    C -->|"全部失败"| D["返回错误给用户"]

    E["配置示例"] --> F["models.fallbacks:\n  - claude-opus-4\n  - claude-sonnet-4\n  - claude-haiku-3-5"]
```

#### 支持的模型提供商

| 提供商 | 认证方式 |
|--------|----------|
| Anthropic | API Key / OAuth (Claude Pro/Max) |
| OpenAI | API Key / OAuth (ChatGPT Plus) |
| Google Gemini | API Key |
| Ollama | 本地无需认证 |
| AWS Bedrock | AWS 凭证 |
| Azure OpenAI | API Key + Endpoint |
| Cloudflare AI | API Key |
| HuggingFace | API Key |
| BytePlus/Volcengine | API Key |
| 以及更多... | |

### 3.9 Subagent System — 子 Agent 系统

**文件**：`src/agents/tools/sessions-spawn-tool.ts` + `src/agents/subagent-registry.ts`

OpenClaw 支持 Agent 动态生成子 Agent（类似 CrewAI / AutoGen），实现并行/串行任务分解。

```mermaid
graph TD
    A["主 Agent (Root)"] -->|"sessions_spawn 工具"| B["子 Agent 1\n负责搜索资料"]
    A -->|"sessions_spawn 工具"| C["子 Agent 2\n负责写代码"]
    A -->|"sessions_spawn 工具"| D["子 Agent 3\n负责发送结果"]

    B -->|"完成"| A
    C -->|"完成"| A
    D -->|"完成"| A

    subgraph SubagentRegistry["SubagentRegistry 管理所有子Agent"]
        B
        C
        D
    end
```

#### 子 Agent 设计要点

- **深度限制**：防止无限递归创建子 Agent（默认最大深度 3）
- **超时控制**：每个子 Agent 有独立超时
- **结果汇总**：父 Agent 等待子 Agent 完成后继续
- **Steer（引导）**：可以向运行中的子 Agent 发送指令
- **线程 ID**：子 Agent 继承父 Agent 的会话上下文

---

## 4. 关键数据流

### 4.1 完整的消息处理流程

```mermaid
flowchart TB
    Start["用户通过 Telegram 发送消息\n'帮我整理一下桌面文件'"]

    Start --> CH["Telegram Channel Plugin\n接收消息"]
    CH --> GW["Gateway\n路由消息"]
    GW --> AR["AgentRunner.run()"]

    AR --> SP["构建 System Prompt\n= Identity + Skills + Tools + Bootstrap"]
    SP --> HC["加载历史对话\n(最近 N 条消息)"]
    HC --> MS["Memory Search\n查找相关记忆"]
    MS --> LLM["发送给 LLM\n(Claude Opus)"]

    LLM --> TC{LLM 决策}

    TC -->|"直接回复"| Reply["生成回复文本\n流式输出"]
    TC -->|"需要工具"| ToolCall["工具调用"]

    ToolCall --> exec["exec: ls ~/Desktop"]
    exec --> Result["返回文件列表"]
    Result --> LLM

    LLM --> TC2{再次决策}
    TC2 -->|"需要操作文件"| ToolCall2["exec: mkdir ~/Desktop/organized\nmv *.pdf ~/Desktop/organized/"]
    ToolCall2 --> Result2["操作结果"]
    Result2 --> LLM

    LLM --> Reply
    Reply --> GW2["Gateway 输出"]
    GW2 --> CH2["Telegram Channel\nsendMessage"]
    CH2 --> End["用户收到回复\n'已帮您整理，将 PDF 移至 organized 目录'"]
```

### 4.2 多渠道会话隔离

```mermaid
graph LR
    subgraph Sessions["会话隔离 (Session Key)"]
        S1["telegram:123456\n会话 A"]
        S2["whatsapp:+8613800138000\n会话 B"]
        S3["slack:U0XXXXXX\n会话 C"]
    end

    subgraph Storage["磁盘持久化"]
        F1["~/.openclaw/sessions/telegram-123456/\n  transcript.json\n  workspace/"]
        F2["~/.openclaw/sessions/whatsapp-xxx/\n  transcript.json\n  workspace/"]
        F3["~/.openclaw/sessions/slack-xxx/\n  transcript.json\n  workspace/"]
    end

    S1 --> F1
    S2 --> F2
    S3 --> F3
```

---

## 5. 安全设计

OpenClaw 在安全上投入了大量精力，核心思路是：**强默认 + 清晰的危险路径**。

```mermaid
graph TD
    subgraph TrustLevel["信任层级"]
        L1["Owner\n最高权限，可用所有工具"]
        L2["本地连接\n可自动审批配对"]
        L3["外部连接\n必须显式审批"]
    end

    subgraph Security["安全机制"]
        M1["设备配对\n每个新设备需要审批"]
        M2["执行审批\n高危命令需要用户确认"]
        M3["沙箱隔离\n可选 Docker 沙箱执行"]
        M4["工具策略\n精细的工具允许/拒绝列表"]
        M5["Gateway Token\n所有 WS 连接需要认证"]
        M6["挑战签名\nconnect 时需签名 nonce"]
        M7["Origin Check\nHTTP 请求来源校验"]
        M8["速率限制\n控制面板 API 限流"]
    end
```

### 沙箱执行架构

```mermaid
graph LR
    A["Agent 调用 exec 工具"] --> B{沙箱模式?}
    B -->|"关闭 (默认)"| C["直接在宿主机执行\n有审批保护"]
    B -->|"开启"| D["在 Docker 容器中执行\n挂载只读/读写路径"]
    D --> E["容器隔离\n无法访问宿主机敏感文件"]
```

---

## 6. 技术选型分析

| 模块 | 选型 | 原因 |
|------|------|------|
| 运行时 | Node.js ≥22 | 原生 WebSocket、好的异步模型 |
| 语言 | TypeScript | 易读易改，类型安全，社区大 |
| 构建工具 | tsdown (Rollup) | 快速 ESM bundle |
| 包管理 | pnpm monorepo | workspace 多包管理 |
| WhatsApp | @whiskeysockets/baileys | 唯一可靠的 WA 非官方库 |
| Telegram | grammy | 现代 TypeScript-first Bot 框架 |
| Slack | @slack/bolt | 官方 SDK |
| WebSocket | ws | 轻量，Node 原生友好 |
| HTTP | express 5 | 成熟，插件生态好 |
| 浏览器控制 | playwright-core | 最强大的浏览器自动化 |
| 数据验证 | zod 4 | TypeScript-first 验证 |
| 测试 | vitest | 快速，ESM 原生支持 |

---

## 7. 复刻路线图

如果你要从头复刻一个类似系统，推荐按以下顺序进行：

```mermaid
gantt
    title 复刻路线图（从简到复杂）
    dateFormat  X
    axisFormat  Phase %s

    section Phase 1 核心骨架
    Agent Runner (ReAct Loop)    :done, p1a, 0, 2
    基础工具 (exec/read/write)   :done, p1b, 0, 2
    CLI 接口                     :done, p1c, 1, 2

    section Phase 2 Gateway
    WebSocket 服务器             :p2a, 2, 4
    基础 Wire 协议               :p2b, 2, 4
    会话管理                     :p2c, 3, 4

    section Phase 3 渠道
    一个渠道适配器 (如Telegram)  :p3a, 4, 6
    渠道插件接口抽象             :p3b, 5, 6
    更多渠道...                  :p3c, 6, 8

    section Phase 4 增强
    多模型+故障转移              :p4a, 6, 8
    插件系统                     :p4b, 7, 9
    记忆系统                     :p4c, 8, 10
    子 Agent                     :p4d, 9, 10
```

### 最小可行版本（MVP）架构建议

对于自研版本，推荐以下精简架构：

```mermaid
graph TB
    subgraph MVP["你的 MVP 架构"]
        CLI2["CLI 入口\n(Commander.js)"]
        Loop["Agent Loop\n(ReAct)"]
        Tools2["工具集\nexec/read/write/web-search"]
        Models2["模型适配层\n(Anthropic/OpenAI SDK)"]
        Session2["会话存储\n(JSON 文件)"]
        Channel2["单渠道\n(Telegram)"]
    end

    CLI2 --> Loop
    Loop --> Tools2
    Loop --> Models2
    Loop --> Session2
    Channel2 --> Loop
```

### 关键代码模式参考

#### 1. ReAct Agent 循环骨架

```typescript
async function runAgentLoop(params: AgentParams) {
  const messages: Message[] = [
    { role: "system", content: buildSystemPrompt(params) },
    ...params.history,
    { role: "user", content: params.userMessage }
  ];

  while (true) {
    const response = await llm.call({ messages, tools });

    if (response.stop_reason === "end_turn") {
      // 纯文本回复，结束
      yield { type: "text", content: response.text };
      break;
    }

    if (response.stop_reason === "tool_use") {
      // 执行工具
      for (const toolCall of response.tool_calls) {
        yield { type: "tool_start", name: toolCall.name };
        const result = await executeTool(toolCall);
        yield { type: "tool_result", result };

        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: [{ type: "tool_result", ...result }] });
      }
      // 继续循环
    }
  }
}
```

#### 2. 工具定义接口

```typescript
interface Tool<P = Record<string, unknown>> {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(params: P, context: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  sessionId: string;
  userId: string;
  workspaceDir: string;
  signal: AbortSignal;  // 支持取消
}

interface ToolResult {
  content: string | object;
  isError?: boolean;
}
```

#### 3. 渠道适配器接口

```typescript
interface ChannelAdapter {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: MessageHandler): void;
  sendText(target: string, text: string): Promise<void>;
  sendTyping(target: string): Promise<void>;
}

type MessageHandler = (event: IncomingMessage) => Promise<void>;

interface IncomingMessage {
  channelId: string;    // "telegram"
  chatId: string;       // 用户/群组 ID
  userId: string;       // 发消息的人
  text: string;
  attachments?: Attachment[];
}
```

### 重要经验总结

1. **会话 Key 设计要早**：`{channel}:{chatId}` 格式，决定了多渠道隔离粒度
2. **Tool Result 截断要考虑**：Shell 命令输出可能很长，需要限制 token 数
3. **Auth Profile 轮转是刚需**：生产中 Rate Limit 很常见，多 Key 轮转必须设计
4. **Compaction 要做**：长对话会超出上下文窗口，需要摘要压缩历史
5. **WebSocket 协议幂等性**：`idempotencyKey` 防止网络抖动导致重复执行
6. **工具审批体验**：危险操作要给用户审批机会，否则用户不敢用
7. **节点设计解耦**：把需要原生能力（摄像头、屏幕）的部分独立为 Node，通过协议通信

---

*文档生成时间：2026-02-26*
*分析基于 OpenClaw v2026.2.25 源码*
*仓库：https://github.com/openclaw/openclaw*

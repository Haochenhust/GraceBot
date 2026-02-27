# GraceBot 开发计划（按模块）

> 指导思想：**每个模块完成后，都能在飞书机器人上完整验收**。  
> 按模块推进，模块边界清晰、依赖可追溯，不做「按天」式排期。
>
> **LLM 内容语言**：所有送入模型的内容（System Prompt、SOUL.md、Skills、USER.md、Memory、Profile 等）**一律使用英文**，详见 [dev/LLM-content-language.md](LLM-content-language.md)。

---

## 1. 模块总览与依赖关系

### 1.1 模块列表与开发顺序

| 序号 | 模块名称 | 状态 | 说明 |
|:----:|----------|------|------|
| 0 | 飞书接入（Gateway） | ✅ 已完成 | 长连接收消息、归一化、FeishuAPI 发消息 |
| 1 | 最小对话链路 | ✅ 已完成 | 会话管理 + 任务队列 + 多轮纯文本回复 |
| 2 | 人格与技能 | ✅ 已完成 | PromptBuilder + SOUL.md + Skills 注入 |
| 3 | ReAct 与基础工具 | ✅ 已完成 | 工具注册表 + ReAct 循环 + exec + file_read |
| 4 | 文件与网络工具 | ✅ 已完成 | file_write / file_edit / web_search / web_fetch |
| 5 | 记忆系统 | ✅ 已完成 | 向量记忆 + memory_read / memory_write + 自动检索 |
| 6 | 用户画像与技能迭代 | ✅ 已完成 | USER.md 自动更新、Skill 自我迭代 |
| 7 | 多模型与稳定性 | ✅ 已完成 | ModelRouter 容错、Compaction、HookBus/插件骨架 |

### 1.2 依赖关系图

```mermaid
flowchart LR
    M0["0. 飞书接入"]
    M1["1. 最小对话链路"]
    M2["2. 人格与技能"]
    M3["3. ReAct 与基础工具"]
    M4["4. 文件与网络工具"]
    M5["5. 记忆系统"]
    M6["6. 用户画像与技能迭代"]
    M7["7. 多模型与稳定性"]

    M0 --> M1
    M1 --> M2
    M2 --> M3
    M3 --> M4
    M3 --> M5
    M4 --> M5
    M5 --> M6
    M5 --> M7
    M6 --> M7
```

- **模块 1** 只依赖已完成的 Gateway（CentralController 接 dispatch、发回复）。
- **模块 2** 依赖模块 1（Tasking 已能加载历史并调 Agent，在此基础上加 SOUL/Skills）。
- **模块 3** 依赖模块 2（需要已有 PromptBuilder 与 system prompt 结构，再接入工具与 ReAct）。
- **模块 4** 依赖模块 3（在已有 ReAct + 工具注册表上增加更多工具）。
- **模块 5** 依赖模块 3（ReAct 与工具骨架），可与模块 4 并行或在其后；记忆检索需在 Tasking 中注入，与模块 4 无强依赖。
- **模块 6、7** 依赖模块 5（用户画像/插件会用到记忆与稳定链路）。

---

## 2. 模块 0：飞书接入（已完成）

当前已实现内容：

- **Gateway**：`index.ts` 创建 Hono、注册 `/health`、调用 `startFeishuLongConnection`。
- **feishu-ws**：飞书官方 SDK 长连接，订阅 `im.message.receive_v1`，归一化后 `controller.dispatch(message)`。
- **normalizer**：飞书事件 → `UnifiedMessage`（文本 + mentions）。
- **FeishuAPI**：`tenant_access_token`、`replyMessage`、`sendMessage`。

无需在本计划中再排期；后续模块均假设「飞书发消息 → 能进 Kernel → 能通过 FeishuAPI 回消息」。

---

## 3. 模块 1：最小对话链路

### 3.1 目标

在飞书上发多轮消息，Bot 能按**会话**回复，且**历史持久化**（重启后仍可延续上下文）。不涉及人格、技能、工具，仅「会话 + 队列 + 纯文本多轮对话」。

### 3.2 范围

| 子项 | 内容 |
|------|------|
| User-Space | 首次收到用户消息时初始化 `data/users/{userId}/` 及 sessions 目录 |
| SessionManager | 按话题：`getOrCreate(userId, chatId, rootId)`，**话题内无超时**（只有用户删除话题或新开话题才切换会话）；`getHistory`、`appendHistory`，会话持久化到 JSON |
| Scheduling | **持久化队列**：pending + in_progress 落盘（`data/queue/`），重启后恢复未处理消息；并发与去重（按 messageId）、出队交给 Tasking |
| Tasking 骨架 | 加载会话历史 → 组装最简 `AgentContext`（仅 history + 当前 message）→ 调 AgentRunner → 保存历史 → FeishuAPI 回复 |
| CentralController | `dispatch` 内：群聊 @ 过滤、getOrCreate 会话、enqueue(task)；提供 `sendReply` 给 Tasking |
| AgentRunner 最简版 | 无 tools、无 skills，仅固定 system prompt（如「你是 GraceBot」）+ history + 当前用户消息，单次 LLM 调用，返回纯文本 |
| ModelRouter 最简版 | 单模型、单 API Key，直接调 Anthropic/OpenAI 等，无容错 |

### 3.3 依赖

- 仅依赖 **模块 0**（Gateway 已把 `UnifiedMessage` 交给 CentralController，且能通过 FeishuAPI 发回复）。

### 3.4 涉及文件/目录

```
src/kernel/session-manager.ts   # 会话管理（按话题、无超时）
src/kernel/scheduling.ts       # 持久化队列（pending + in_progress，重启恢复）
src/kernel/tasking.ts          # 任务执行（仅历史 + 调 Agent + 存历史 + 回复）
src/kernel/central-controller.ts
src/agents/runner.ts           # 最简版（无 tool_use）
src/agents/model-router.ts     # 最简版（单模型）
src/shared/types.ts            # UnifiedMessage, Session, AgentContext, AgentResult, AgentTask 等
src/shared/utils.ts            # initUserSpace、getUserWorkspace 等
data/users/{userId}/sessions/  # 会话 JSON 存储
data/queue/                    # 队列持久化（pending.json、in_progress.json）
```

### 3.5 阶段性验收（飞书实测）

- [x] 飞书私聊发多条消息，Bot 回复正常，且能引用上文（多轮上下文连贯）。
- [x] 检查 `data/users/{userId}/sessions/*.json`，历史记录正确写入。
- [x] 重启服务后，再发消息，Bot 仍能延续上一轮对话。
- [x] 按话题会话：同一话题内无超时；用户新开一条消息（不回复原话题）时视为新话题、新会话。
- [x] 连续快速发两条消息，两条均被处理且顺序合理（队列生效）。
- [x] 有消息在队列中时重启服务，重启后该消息仍被处理（持久化队列生效）。

---

## 4. 模块 2：人格与技能

### 4.1 目标

Bot 具备**可配置人格**（SOUL.md）和**技能描述**（Skills），回复风格与「能做什么」的说明来自配置与文件，并在飞书中可验证。

### 4.2 范围

| 子项 | 内容 |
|------|------|
| SOUL.md | 默认人格文件（如 `data/shared/defaults/SOUL.md`），User-Space 初始化时可复制到 `data/users/{id}/SOUL.md`；Tasking 加载当前用户 SOUL |
| USER.md | 占位即可（空文件或默认文案），PromptBuilder 中预留「关于当前用户」段落 |
| SkillLoader | 扫描 `data/shared/skills/*.md`（全局）、`data/users/{id}/skills/*.md`（用户），用户同名覆盖全局；返回技能名 + 内容列表 |
| PromptBuilder | 组装 system prompt：身份（名字、时间）+ 人格（SOUL.md）+ 关于用户（USER.md）+ 技能（Skills 列表）+ 可用工具占位（可写「暂无」） |
| Tasking 补全 | 加载 soul、userProfile、skills，传入 `AgentContext`；AgentRunner 使用 PromptBuilder 产出的 system prompt |

### 4.3 依赖

- **模块 1**（已有 Tasking 加载历史、调 Agent、保存历史并回复）。

### 4.4 涉及文件/目录

```
src/agents/prompt-builder.ts
src/skills/skill-loader.ts
src/kernel/tasking.ts          # 增加 soul / userProfile / skills 加载与注入
data/shared/defaults/SOUL.md
data/shared/skills/*.md         # 至少 1 个全局技能，如 default.md、coding.md
data/users/{id}/SOUL.md
data/users/{id}/USER.md         # 占位
```

### 4.5 阶段性验收（飞书实测）

- [x] 飞书问「你叫什么名字？」→ 回答与 SOUL.md 中设定一致。
- [x] 修改 SOUL.md 内容并重启，再问同一问题 → 回复风格/内容随之变化。
- [x] 飞书问「你有什么能力？」或「你会做什么？」→ 能说出 Skills 中描述的能力。
- [x] 新增或修改一个 skill 文件，重启后 Bot 行为或自我描述与之相符。

---

## 5. 模块 3：ReAct 与基础工具

### 5.1 目标

Bot 能**解析并执行工具调用**（ReAct 循环），并在飞书中完成至少一种「真实操作」的端到端验证（如执行命令或读文件）。

### 5.2 范围

| 子项 | 内容 |
|------|------|
| ToolRegistry | 工具注册、`execute(name, params, context)`、`toLLMTools()` 转为模型所需 schema；错误兜底（返回可读错误信息） |
| AgentRunner ReAct | 支持 `tool_use`：循环调用 LLM → 若有 tool_use 则执行工具 → 将结果追加到 messages → 再调 LLM；`MAX_TOOL_ROUNDS` 防死循环；工具结果截断 |
| 至少 2 个工具 | 建议 **exec**（Shell 命令，cwd 为用户 workspace）+ **file_read**（读文件），便于在飞书里直接验证「执行 ls」「读某文件内容」 |
| PromptBuilder 补全 | 在 system prompt 中加入「可用工具」说明（来自 ToolRegistry），指导模型何时调用工具 |
| Tasking | 将 `toolRegistry.getAvailableTools()` 传入 AgentContext；AgentRunner 使用工具列表参与 ReAct |

### 5.3 依赖

- **模块 2**（已有 PromptBuilder 与完整 system prompt 结构，此处增加工具列表与 ReAct 逻辑）。

### 5.4 涉及文件/目录

```
src/tools/registry.ts
src/tools/exec.ts
src/tools/file-read.ts
src/agents/runner.ts            # ReAct 循环、tool_use 分支
src/agents/prompt-builder.ts    # 工具目录段落
src/kernel/tasking.ts           # 传入 tools
```

### 5.5 阶段性验收（飞书实测）

- [x] 飞书发送「执行 ls」或「列出当前目录文件」→ Bot 调用 exec 并返回真实命令输出。
- [x] 飞书发送「读取 workspace 下的 xxx 文件」→ Bot 调用 file_read 并返回文件内容（或合理错误提示）。
- [x] 工具执行失败（如命令不存在、文件不存在）时，Bot 在飞书里给出明确错误说明而非崩溃。
- [x] 多轮工具调用（如先 ls 再读某个文件）能连续执行并最终回复正确。

---

## 6. 模块 4：文件与网络工具

### 6.1 目标

在 ReAct 与工具骨架之上，增加**文件写入/编辑**和**网络搜索/抓取**能力，并在飞书中可完整验证。

### 6.2 范围

| 子项 | 内容 |
|------|------|
| file_write | 写入文件（含自动创建目录），路径限制在用户 workspace 内 |
| file_edit | 基于「old_string → new_string」的精确替换，避免整文件重写 |
| web_search | 接入搜索 API（如 Tavily），返回标题/URL/摘要列表，结果截断 |
| web_fetch | 请求 URL 取回内容，HTML 转纯文本，长度与超时限制 |
| 注册与配置 | 在 ToolRegistry 中注册上述工具；config 中增加搜索 API 等配置项 |

### 6.3 依赖

- **模块 3**（ReAct + ToolRegistry 已可用，本模块仅新增工具实现与注册）。

### 6.4 涉及文件/目录

```
src/tools/file-write.ts
src/tools/file-edit.ts
src/tools/web-search.ts
src/tools/web-fetch.ts
src/tools/registry.ts           # 注册新工具
config.yaml / .env              # 搜索 API key 等
```

### 6.5 阶段性验收（飞书实测）

- [x] 飞书「在 workspace 下创建 test.txt，内容为 Hello」→ 文件真实存在且内容正确。
- [x] 飞书「把 test.txt 里的 Hello 改成 Hi」→ 通过 file_edit 修改成功并在回复中体现。
- [x] 飞书「搜索 2026 年 xxx 新闻」→ 调用 web_search 并基于结果总结回复。
- [x] 飞书「抓取 https://xxx 的内容并总结」→ 调用 web_fetch 并返回解读；超长或超时时有合理截断/提示。

---

## 7. 模块 5：记忆系统

### 7.1 目标

Bot 具备**跨会话记忆**：用户可让 Bot「记住」某事，在新会话或后续对话中能**自动或被动回忆**并影响回复。

### 7.2 范围

| 子项 | 内容 |
|------|------|
| Embedding | 调用 Embedding API（如 OpenAI text-embedding-3-small），对文本生成向量；可做简单缓存（相同文本不重复调） |
| VectorStore | 本地存储（如 `data/users/{id}/memory/vectors.json` + entries），支持按向量写入与 Top-K 相似度检索（余弦相似度） |
| MemoryManager | `write(userId, entry)`：写条目 + 向量化 + 落库；`search(userId, query, topK)`：对 query 向量化后检索 Top-K |
| memory_read / memory_write 工具 | Agent 通过 ReAct 调用：memory_write 写入一条记忆，memory_read 可主动查（可选）；均需注册到 ToolRegistry |
| Tasking 自动检索 | 每次执行任务前，用 `memoryManager.search(userId, message.text)` 得到相关记忆，传入 AgentContext |
| PromptBuilder | 增加「相关记忆」段落，将检索到的记忆注入 system prompt |
| SOUL/Skills 说明 | 在人格或技能中说明：当用户明确要求「记住」某事时，应调用 memory_write |

### 7.3 依赖

- **模块 3**（ReAct + 工具）；与模块 4 无强依赖，但通常先完成模块 4 再做记忆，便于一起验收。

### 7.4 涉及文件/目录

```
src/memory/embedding.ts
src/memory/vector-store.ts
src/memory/memory-manager.ts
src/tools/memory-read.ts
src/tools/memory-write.ts
src/kernel/tasking.ts           # 调用 memoryManager.search，传入 context.memories
src/agents/prompt-builder.ts    # 相关记忆段落
data/users/{id}/memory/entries.json
data/users/{id}/memory/vectors.json
```

### 7.5 阶段性验收（飞书实测）

- [x] 飞书「记住：我是 TypeScript 开发者」→ Bot 确认已记住；检查 `entries.json` 有对应内容。
- [x] 新开会话（或 30 分钟后新会话），问「你还记得我是做什么的吗？」→ Bot 能正确回忆。
- [x] 飞书问一个与已存记忆相关的问题（未显式说「记住」），Bot 回复中能体现相关记忆（自动检索生效）。
- [x] 记忆内容过长或条数过多时，检索与注入有合理截断，不导致 prompt 超长报错。

---

## 8. 模块 6：用户画像与技能迭代

### 8.1 目标

- **USER.md**：根据对话内容自动更新用户画像，后续对话中 Bot 能利用「关于当前用户」信息。
- **技能自我迭代**（可选）：Agent 或定时任务可对 Skills 文件提出修改建议或自动追加，使 Bot 能力随使用演进。

### 8.2 范围

| 子项 | 内容 |
|------|------|
| HookBus | 事件：`on-message`、`after-agent`、`after-tool-call` 等；CentralController / Tasking 在适当时机 emit；插件可订阅 |
| USER.md 自动更新 | 在 `after-agent` 中触发（可节流，如每 N 次对话一次）；用轻量模型分析近期对话，提取用户特征，追加写入 USER.md |
| user-profile | 封装「从对话中提取画像 + 写回 USER.md」的逻辑 |
| Skill 自我迭代（可选） | SkillUpdater：根据对话或 Agent 建议，修改/追加 `data/users/{id}/skills/` 或 `data/shared/skills/` 下 Markdown；可放在插件或独立脚本中 |

### 8.3 依赖

- **模块 5**（记忆已就绪，对话数据与上下文足够做画像分析）。

### 8.4 涉及文件/目录

```
src/plugins/hook-bus.ts
src/memory/user-profile.ts
src/kernel/central-controller.ts # 接入 HookBus
src/kernel/tasking.ts            # after-agent 触发
src/skills/skill-updater.ts      # 可选
data/users/{id}/USER.md
```

### 8.5 阶段性验收（飞书实测）

- [x] 与 Bot 进行多轮对话后，检查 `data/users/{id}/USER.md`，存在自动追加的用户相关描述。
- [x] 在后续对话中问「你知道我的偏好/职业吗？」→ 回复能体现 USER.md 中的画像。
- [x] （若实现技能迭代）通过对话或脚本触发技能更新后，Bot 在新对话中体现出新技能描述。

---

## 9. 模块 7：多模型与稳定性

### 9.1 目标

- **ModelRouter**：多 Key/多模型容错（限流切换、模型不可用 failover）。
- **长对话**：Context 超长时通过 **Compaction** 压缩历史，避免溢出报错。
- **插件骨架**：HookBus 已接入，可扩展 after-agent、定时任务等插件，便于后续扩展。

### 9.2 范围

| 子项 | 内容 |
|------|------|
| ModelRouter 增强 | 多 API Key 轮转、Rate Limit 时标记冷却并切换、主模型不可用时 failover 到备用模型、全部失败时返回友好错误信息 |
| Compaction | 检测 Context Overflow 类错误，用 LLM 将长历史压缩为摘要，保留最近若干轮完整对话 + 摘要，再重试 |
| AgentRunner 错误处理 | 将限流/模型错误/上下文溢出统一转交 ModelRouter 或 Compaction 处理，避免未捕获异常导致进程退出 |
| 全局错误兜底 | Agent 执行中未处理异常 → 飞书回复友好提示；Gateway 层异常不导致进程崩溃 |
| Plugin 骨架 | PluginManager 注册插件、加载 Hook；内置 Cron 插件骨架（可选，仅占位即可）；README 中说明如何启动与扩展 |

### 9.3 依赖

- **模块 5**（记忆与完整对话链路已稳定）；**模块 6** 可选（HookBus 在本模块中会与 Tasking/Controller 一起完善）。

### 9.4 涉及文件/目录

```
src/agents/model-router.ts       # 多 Key、failover、限流
src/agents/compaction.ts
src/agents/runner.ts            # handleError 分支
src/plugins/plugin-manager.ts
src/plugins/builtin/cron-plugin.ts  # 骨架
README.md                       # 启动方式、配置、扩展说明
```

### 9.5 阶段性验收（飞书实测）

- [x] 故意使用错误或限流的 API Key → Bot 能切换或等待后重试，并在飞书给出可理解的提示而非崩溃。
- [x] 进行极长多轮对话或注入超长上下文 → 触发 Compaction 后仍能正常回复，不出现 context overflow 错误。
- [x] 关闭主模型或模拟网络故障 → 若有备用模型则自动切换并回复。
- [x] 阅读 README，能按文档完成配置、启动并在飞书中完成一次完整对话。

---

## 10. 模块完成度总览（验收矩阵）

| 模块 | 飞书多轮对话 | 历史持久化 | 人格/技能 | 执行工具 | 文件/网络工具 | 跨会话记忆 | 用户画像 | 容错/压缩 |
|:----:|:------------:|:----------:|:--------:|:--------:|:-------------:|:----------:|:--------:|:---------:|
| 0 飞书接入 | — | — | — | — | — | — | — | — |
| 1 最小对话链路 | ✅ | ✅ | — | — | — | — | — | — |
| 2 人格与技能 | ✅ | ✅ | ✅ | — | — | — | — | — |
| 3 ReAct+基础工具 | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| 4 文件与网络工具 | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| 5 记忆系统 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| 6 用户画像与技能迭代 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| 7 多模型与稳定性 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 11. 开发与验收原则

1. **按模块推进**：建议严格按 1 → 2 → 3 → … 顺序开发，避免跳过依赖导致返工。
2. **每模块必须飞书验收**：每个模块的「阶段性验收」均在飞书机器人上完成至少一遍，再进入下一模块。
3. **模块内可再拆任务**：每个模块下的「范围」可拆成更细的 TODO（如按文件/函数），但**对外里程碑**以「该模块全部验收通过」为准。
4. **文档与方案对齐**：实现细节以 `GraceBot技术方案.md` 为准；本计划只规定模块边界、依赖与验收标准，不重复技术方案中的代码级设计。

---

*文档版本：v0.1*  
*按模块拆分，基于 GraceBot技术方案.md*  
*更新日期：2026-02-27*

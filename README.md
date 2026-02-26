# GraceBot

> Self-hosted AI 助理 —— 通过飞书机器人接入，支持工具调用、持久记忆和可进化的技能体系。

## 特性

- **ReAct Agent 循环** — 推理 + 行动，多轮工具调用
- **持久记忆** — 跨会话记忆，语义向量检索
- **技能系统** — Markdown 驱动，Agent 可自我迭代
- **多模型支持** — API Key 轮转 + 故障自动转移
- **插件扩展** — Hook 生命周期 + MCP 协议接入外部工具

## 技术栈

| 模块     | 选型                            |
| -------- | ------------------------------- |
| 运行时   | Bun                             |
| 语言     | TypeScript                      |
| HTTP     | Hono                            |
| 日志     | Pino                            |
| 数据验证 | Zod                             |
| 进程守护 | PM2                             |
| MCP      | @modelcontextprotocol/sdk       |

## 快速开始

```bash
# 1. 安装依赖
bun install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入飞书和 LLM API 密钥

# 3. 编辑配置文件
# 按需修改 config.yaml

# 4. 开发模式启动
bun run dev

# 5. 生产模式 (PM2)
bun run pm2:start
```

## 目录结构

```
src/
├── gateway/          # I/O 层：飞书 Webhook 接收与消息归一化
├── kernel/           # 核心调度：会话管理、任务队列、上下文组装
├── agents/           # Agent 执行引擎：ReAct 循环、Prompt 构建、模型路由
├── tools/            # 工具体系：Shell、文件、网络、记忆、MCP
├── memory/           # 记忆系统：向量嵌入 + 语义检索
├── skills/           # 技能系统：Markdown Prompt 加载与自我迭代
├── plugins/          # 插件系统：Hook 事件总线 + 内置插件
├── shared/           # 公共模块：类型、配置、日志、工具函数
└── index.ts          # 应用入口

data/
├── users/{id}/       # 用户隔离数据 (SOUL.md, USER.md, memory, sessions, workspace)
└── shared/           # 全局共享数据 (skills, plugins)
```

## License

Private — 个人使用

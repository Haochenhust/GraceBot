# GraceBot Bun 开发与调试速查

在项目根目录执行（或先 `cd` 到项目根）。

---

## 日常开发

| 操作 | 命令 |
|------|------|
| **安装依赖** | `bun install` |
| **开发模式**（改代码自动重启） | `bun run dev` |
| **单次运行**（不监听文件） | `bun run start` |
| **跑测试** | `bun test` |
| **类型检查** | `bun run typecheck` |

---

## 调试时提高日志详细度

默认是 `info`，想看更细的日志（如 `debug`）可以：

```bash
LOG_LEVEL=debug bun run dev
```

或单次运行：

```bash
LOG_LEVEL=debug bun run start
```

---

## 环境变量

- Bun 会自动加载项目根目录的 `.env`，无需额外命令。
- 首次使用：复制 `.env.example` 为 `.env`，填入飞书与 LLM API 等配置。

---

## 常用组合

```bash
# 开发：带 watch + 调试级日志
LOG_LEVEL=debug bun run dev

# 只做类型检查（不改动代码）
bun run typecheck

# 直接跑入口（等价于 bun run start）
bun run src/index.ts
```

---

## 和 PM2 的关系

- **本地调试**：用 `bun run dev`，改代码自动重启，方便开发。
- **长期运行**：用 PM2（见 [docs/PM2.md](PM2.md)），适合 24/7 或部署。

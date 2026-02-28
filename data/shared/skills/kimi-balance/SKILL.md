---
name: kimi-balance
description: 查询 Kimi (Moonshot) API 账户余额，用于回答用户关于额度、余额、剩余用量等问题。
---

# Kimi API 余额

当用户询问 Kimi API 的余额、额度、剩余用量、是否还有钱、quota 等时，使用 `kimi_balance` 工具查询当前账户余额并回复。

## 何时使用
- 用户说「查一下 Kimi 余额」「还有多少额度」「API 余额」「Kimi 账户余额」
- 用户问「还能用多久」「剩多少钱」等与 Moonshot/Kimi 账户相关的问题

## 使用方式
- 调用 `kimi_balance`，无需参数。
- 将返回的余额信息用自然语言转述给用户（例如「当前 Kimi API 账户余额为 XX 元」）。

## 说明
- 依赖配置中的 Kimi API Key（models.profiles 里 provider 为 kimi 的 key）。
- 接口文档：<https://platform.moonshot.cn/docs/api/balance>

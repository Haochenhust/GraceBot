# 飞书话题（Thread）接入调研

> 为模块一「最小对话链路」提供：飞书话题在消息收发中的语义、以及如何接入。

---

## 1. 飞书话题是什么

- **话题（Thread）**：在飞书里，对某条消息「回复」会形成一条回复链，这条链就是一个话题。
- **root_id**：话题的**根消息**的 `message_id`，整条回复树共用同一个 root_id。
- **parent_id**：当前这条消息**直接回复**的那条消息的 `message_id`。
- 若用户是「首条消息」（没有回复任何人），则没有 root_id/parent_id；若用户点击某条消息的「回复」再发，则新消息会带 root_id、parent_id。

---

## 2. 接收消息事件里的字段

`im.message.receive_v1` 事件体中，`event.message` 包含：


| 字段           | 说明                          |
| ------------ | --------------------------- |
| `message_id` | 当前消息 ID（我们回复时用这个）           |
| `chat_id`    | 会话 ID（群或单聊）                 |
| `chat_type`  | 如 `group`、`p2p`             |
| `content`    | JSON 字符串，如 `{"text":"xxx"}` |
| `root_id`    | 可选。该消息所在话题的根消息 ID（`om_` 开头） |
| `parent_id`  | 可选。被直接回复的那条消息的 ID           |


**结论**：在 `normalizer` 里从 `message.root_id`、`message.parent_id` 解析并传入下游，便于后续按话题维度的会话或展示。

---

## 3. 回复消息 API（我们如何「发在话题里」）

- **接口**：`POST /open-apis/im/v1/messages/{message_id}/reply`
- **请求体**：`receive_id`（可选）、`content`、`msg_type` 等；**不需要**在请求体里传 root_id。
- **语义**：对 `message_id` 对应的那条消息进行「回复」，飞书会把我们发出的新消息挂在那条消息下面，自动归属到同一话题。

因此：

- 我们**始终用用户发来的那条消息的 `message_id`** 调用 `replyMessage(messageId, text)`，回复就会出现在用户那条消息的回复里，即**天然在话题内**。
- 若用户是在某条消息下回复的，我们回复「用户当前这条消息」，我们的回复与用户消息在同一话题下（飞书服务端会根据被回复消息的 root_id 自动关联）。

**错误码**：若话题已被删除或无效，可能返回 `230019`（当前话题不存在），需要在 FeishuAPI 里做错误处理与重试/降级（例如 fallback 到向会话发新消息）。

---

## 4. 与模块一「最小对话链路」的关系（已按话题分会话）

| 点 | 说明 |
|----|------|
| **会话维度** | Session 按**话题**：`getOrCreate(userId, chatId, rootId)`。同一用户在同一话题内的多轮对话共享一个 Session；直接跟机器人发新消息会生成新话题（rootId = 该条消息的 message_id），在新话题里继续聊。 |
| **过期** | 同一话题 **3 小时**无新消息后视为过期，下次在该话题再发会按「新会话」处理（可复用同一 session 文件但历史仍保留）；或理解为 3 小时内同一话题上下文延续。 |
| **回复形态** | 使用 `replyMessage(messageId, text, { chatId })`，回复落在用户消息的回复链（话题）里。若用户删除了该话题，飞书返回 230019，则自动降级为向会话发一条新消息。 |
| **话题被删** | 用户删除话题后，机器人无法再往该话题回复；FeishuAPI 在 230019 时若传入 `chatId` 会 fallback 到 `sendMessage(chatId, text)`，保证用户仍能收到回复。 |

---

## 5. 已实现的代码改动

1. **类型**（`src/shared/types.ts`）  
   - `UnifiedMessage` 含 `rootId?`、`parentId?`；`Session` 含 `chatId`、`rootId`。
2. **Normalizer**（`src/gateway/normalizer.ts`）  
   - 从事件中解析 `root_id`、`parent_id` 写入 `UnifiedMessage`。
3. **SessionManager**  
   - `getOrCreate(userId, chatId, rootId)`，session id 由 `hash(chatId + rootId)` 确定；超时 3 小时（可配置 `session_timeout_minutes`）。
4. **CentralController**  
   - `rootId = message.rootId ?? message.messageId`，再 `getOrCreate(userId, chatId, rootId)`。
5. **FeishuAPI**  
   - `replyMessage(messageId, text, { chatId })`，收到 230019 时用 `sendMessage(chatId, text)` 降级。

---

## 6. 参考链接

- [回复消息 - 飞书 API](https://open.feishu.cn/document/server-docs/im-v1/message/reply)
- [接收消息（事件）](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive)
- [发送消息 - 飞书 API](https://open.feishu.cn/document/server-docs/im-v1/message/create)（可选：向会话发独立消息时的参数说明）


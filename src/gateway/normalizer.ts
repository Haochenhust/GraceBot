import type { UnifiedMessage, Mention } from "../shared/types.js";

export function normalizeFeishuEvent(body: unknown): UnifiedMessage | null {
  const event = (body as Record<string, unknown>).event as
    | Record<string, unknown>
    | undefined;
  if (!event) return null;

  const message = event.message as Record<string, unknown> | undefined;
  if (!message) return null;

  const sender = event.sender as Record<string, unknown> | undefined;
  const senderId = sender?.sender_id as Record<string, unknown> | undefined;

  const chatId = (message.chat_id as string) ?? "";
  const chatType = (message.chat_type as string) === "group" ? "group" : "p2p";
  const messageId = (message.message_id as string) ?? "";
  const userId = (senderId?.open_id as string) ?? "";
  const rootId = (message.root_id as string) || undefined;
  const parentId = (message.parent_id as string) || undefined;

  // 提取文本内容
  let text = "";
  try {
    const content = JSON.parse((message.content as string) ?? "{}");
    text = content.text ?? "";
  } catch {
    text = "";
  }

  // 提取 @提及
  const rawMentions = (message.mentions as Array<Record<string, unknown>>) ?? [];
  const mentions: Mention[] = rawMentions.map((m) => {
    const idObj = m.id as { key?: string } | string | undefined;
    const id = typeof idObj === "string" ? idObj : (idObj?.key ?? "");
    return {
      id,
      name: (m.name as string) ?? "",
      isBot: (m.tenant_key as string) !== undefined,
    };
  });

  return {
    messageId,
    userId,
    chatId,
    chatType: chatType as "p2p" | "group",
    text,
    rootId,
    parentId,
    mentions: mentions.length > 0 ? mentions : undefined,
    timestamp: Date.now(),
  };
}

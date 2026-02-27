import { createLogger } from "../shared/logger.js";
import { readJSON, writeJSON, initUserSpace } from "../shared/utils.js";
import type {
  Session,
  HistoryMessage,
  UnifiedMessage,
  AgentResult,
} from "../shared/types.js";

const log = createLogger("session-manager");

/** 格式化为「年月日时分秒」用于会话文件名，便于像 log 一样一眼看出时间 */
function formatSessionId(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const H = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}${M}${day}${H}${m}${s}`;
}

/** 在已有 sessions 中生成唯一的 session id（同秒内多会话则追加 _1, _2） */
function uniqueSessionId(createdAt: number, existingSessions: Session[]): string {
  const base = formatSessionId(createdAt);
  const used = new Set(existingSessions.map((s) => s.id));
  if (!used.has(base)) return base;
  let n = 1;
  while (used.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export class SessionManager {
  /**
   * 按话题维度获取或创建会话：同一 (userId, chatId, rootId) 共享一个 Session。
   * 话题内无超时，只有用户删除话题或新开话题才会切换会话。
   * rootId 为话题根消息 ID：若用户在某条消息下回复则来自 message.rootId，否则为新话题，取 message.messageId。
   */
  async getOrCreate(
    userId: string,
    chatId: string,
    rootId: string,
  ): Promise<Session> {
    await initUserSpace(userId);

    const existing = await this.getSessionByThread(userId, chatId, rootId);
    if (existing) {
      existing.lastActiveAt = Date.now();
      await this.save(userId, existing);
      return existing;
    }

    return this.createNew(userId, chatId, rootId);
  }

  async getHistory(
    userId: string,
    sessionId: string,
  ): Promise<HistoryMessage[]> {
    const path = `data/users/${userId}/sessions/${sessionId}.json`;
    return (await readJSON<HistoryMessage[]>(path)) ?? [];
  }

  async appendHistory(
    userId: string,
    sessionId: string,
    userMsg: UnifiedMessage,
    agentResult: AgentResult,
  ): Promise<void> {
    const history = await this.getHistory(userId, sessionId);
    history.push(
      { role: "user", content: userMsg.text, timestamp: userMsg.timestamp },
      {
        role: "assistant",
        content: agentResult.text,
        timestamp: Date.now(),
      },
    );
    await writeJSON(
      `data/users/${userId}/sessions/${sessionId}.json`,
      history,
    );
  }

  private async getSessionByThread(
    userId: string,
    chatId: string,
    rootId: string,
  ): Promise<Session | null> {
    const indexPath = `data/users/${userId}/sessions/_index.json`;
    const sessions = (await readJSON<Session[]>(indexPath)) ?? [];
    return (
      sessions.find((s) => s.chatId === chatId && s.rootId === rootId) ?? null
    );
  }

  private async createNew(
    userId: string,
    chatId: string,
    rootId: string,
  ): Promise<Session> {
    const createdAt = Date.now();
    const indexPath = `data/users/${userId}/sessions/_index.json`;
    const sessions = (await readJSON<Session[]>(indexPath)) ?? [];
    const id = uniqueSessionId(createdAt, sessions);

    const session: Session = {
      id,
      userId,
      chatId,
      rootId,
      createdAt,
      lastActiveAt: createdAt,
    };

    sessions.push(session);
    await writeJSON(indexPath, sessions);

    log.info(
      { userId, sessionId: session.id, chatId, rootId },
      "New session (thread) created",
    );
    return session;
  }

  private async save(userId: string, session: Session): Promise<void> {
    const indexPath = `data/users/${userId}/sessions/_index.json`;
    const sessions = (await readJSON<Session[]>(indexPath)) ?? [];
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      sessions[idx] = session;
    } else {
      sessions.push(session);
    }
    await writeJSON(indexPath, sessions);
  }
}

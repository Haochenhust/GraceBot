import { createHash } from "crypto";
import { createLogger } from "../shared/logger.js";
import { readJSON, writeJSON, initUserSpace } from "../shared/utils.js";
import type {
  Session,
  HistoryMessage,
  UnifiedMessage,
  AgentResult,
} from "../shared/types.js";

const log = createLogger("session-manager");

/** 由 chatId + rootId 生成唯一且稳定的 session 文件 id */
function toSessionId(chatId: string, rootId: string): string {
  return createHash("sha256")
    .update(chatId + "\0" + rootId)
    .digest("hex")
    .slice(0, 24);
}

export class SessionManager {
  private sessionTimeoutMs: number;

  constructor(sessionTimeoutMinutes = 180) {
    this.sessionTimeoutMs = sessionTimeoutMinutes * 60 * 1000;
  }

  /**
   * 按话题维度获取或创建会话：同一 (userId, chatId, rootId) 共享一个 Session。
   * rootId 为话题根消息 ID：若用户在某条消息下回复则来自 message.rootId，否则为新话题，取 message.messageId。
   */
  async getOrCreate(
    userId: string,
    chatId: string,
    rootId: string,
  ): Promise<Session> {
    await initUserSpace(userId);

    const id = toSessionId(chatId, rootId);
    const existing = await this.getSessionByThread(userId, chatId, rootId);

    if (
      existing &&
      Date.now() - existing.lastActiveAt < this.sessionTimeoutMs
    ) {
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
    const id = toSessionId(chatId, rootId);
    const indexPath = `data/users/${userId}/sessions/_index.json`;
    const sessions = (await readJSON<Session[]>(indexPath)) ?? [];
    return sessions.find((s) => s.id === id) ?? null;
  }

  private async createNew(
    userId: string,
    chatId: string,
    rootId: string,
  ): Promise<Session> {
    const id = toSessionId(chatId, rootId);
    const session: Session = {
      id,
      userId,
      chatId,
      rootId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    const indexPath = `data/users/${userId}/sessions/_index.json`;
    const sessions = (await readJSON<Session[]>(indexPath)) ?? [];
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx >= 0) {
      sessions[idx] = session;
    } else {
      sessions.push(session);
    }
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

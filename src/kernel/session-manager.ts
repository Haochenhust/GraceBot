import { createLogger } from "../shared/logger.js";
import { generateId, readJSON, writeJSON } from "../shared/utils.js";
import type {
  Session,
  HistoryMessage,
  UnifiedMessage,
  AgentResult,
} from "../shared/types.js";

const log = createLogger("session-manager");

export class SessionManager {
  private sessionTimeoutMs: number;

  constructor(sessionTimeoutMinutes = 30) {
    this.sessionTimeoutMs = sessionTimeoutMinutes * 60 * 1000;
  }

  async getOrCreate(userId: string): Promise<Session> {
    const latest = await this.getLatestSession(userId);

    if (latest && Date.now() - latest.lastActiveAt < this.sessionTimeoutMs) {
      latest.lastActiveAt = Date.now();
      await this.save(userId, latest);
      return latest;
    }

    return this.createNew(userId);
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

  private async getLatestSession(userId: string): Promise<Session | null> {
    const indexPath = `data/users/${userId}/sessions/_index.json`;
    const sessions = await readJSON<Session[]>(indexPath);
    if (!sessions || sessions.length === 0) return null;
    return sessions[sessions.length - 1];
  }

  private async createNew(userId: string): Promise<Session> {
    const session: Session = {
      id: generateId(),
      userId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    const indexPath = `data/users/${userId}/sessions/_index.json`;
    const sessions = (await readJSON<Session[]>(indexPath)) ?? [];
    sessions.push(session);
    await writeJSON(indexPath, sessions);

    log.info({ userId, sessionId: session.id }, "New session created");
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

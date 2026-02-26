import { createLogger } from "../shared/logger.js";
import { generateId, readJSON, writeJSON, cosineSimilarity } from "../shared/utils.js";
import type { MemoryEntry, VectorEntry } from "../shared/types.js";
import type { EmbeddingService } from "./embedding.js";

const log = createLogger("memory-manager");

export class MemoryManager {
  constructor(private embedding: EmbeddingService) {}

  async write(
    userId: string,
    entry: Omit<MemoryEntry, "id">,
  ): Promise<void> {
    const id = generateId();
    const fullEntry: MemoryEntry = { id, ...entry };

    const entries = await this.loadEntries(userId);
    entries.push(fullEntry);
    await this.saveEntries(userId, entries);

    const vector = await this.embedding.embed(entry.content);
    const vectors = await this.loadVectors(userId);
    vectors.push({ id, vector });
    await this.saveVectors(userId, vectors);

    log.info({ userId, memoryId: id, category: entry.category }, "Memory saved");
  }

  async search(
    userId: string,
    query: string,
    topK = 5,
  ): Promise<MemoryEntry[]> {
    const vectors = await this.loadVectors(userId);
    if (vectors.length === 0) return [];

    const entries = await this.loadEntries(userId);

    let queryVector: number[];
    try {
      queryVector = await this.embedding.embed(query);
    } catch (err) {
      log.warn({ err }, "Embedding failed, returning empty results");
      return [];
    }

    const scored = vectors.map((v) => ({
      id: v.id,
      score: cosineSimilarity(queryVector, v.vector),
    }));
    scored.sort((a, b) => b.score - a.score);

    const topIds = new Set(scored.slice(0, topK).map((s) => s.id));
    return entries.filter((e) => topIds.has(e.id));
  }

  private async loadEntries(userId: string): Promise<MemoryEntry[]> {
    return (
      (await readJSON<MemoryEntry[]>(
        `data/users/${userId}/memory/entries.json`,
      )) ?? []
    );
  }

  private async saveEntries(
    userId: string,
    entries: MemoryEntry[],
  ): Promise<void> {
    await writeJSON(`data/users/${userId}/memory/entries.json`, entries);
  }

  private async loadVectors(userId: string): Promise<VectorEntry[]> {
    return (
      (await readJSON<VectorEntry[]>(
        `data/users/${userId}/memory/vectors.json`,
      )) ?? []
    );
  }

  private async saveVectors(
    userId: string,
    vectors: VectorEntry[],
  ): Promise<void> {
    await writeJSON(`data/users/${userId}/memory/vectors.json`, vectors);
  }
}

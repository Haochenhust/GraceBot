import { readJSON, writeJSON, cosineSimilarity } from "../shared/utils.js";
import type { VectorEntry } from "../shared/types.js";

export class VectorStore {
  constructor(private filePath: string) {}

  async load(): Promise<VectorEntry[]> {
    return (await readJSON<VectorEntry[]>(this.filePath)) ?? [];
  }

  async save(entries: VectorEntry[]): Promise<void> {
    await writeJSON(this.filePath, entries);
  }

  async add(entry: VectorEntry): Promise<void> {
    const entries = await this.load();
    entries.push(entry);
    await this.save(entries);
  }

  async search(
    queryVector: number[],
    topK = 5,
  ): Promise<Array<{ id: string; score: number }>> {
    const entries = await this.load();

    const scored = entries.map((e) => ({
      id: e.id,
      score: cosineSimilarity(queryVector, e.vector),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

import { createLogger } from "../shared/logger.js";

const log = createLogger("embedding");

export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
}

/**
 * OpenAI-compatible embedding service.
 * Works with OpenAI, Moonshot/Kimi, Volcengine, or any OpenAI-compatible endpoint.
 */
export class OpenAIEmbedding implements EmbeddingService {
  private apiKey: string;
  private model: string;
  private endpoint: string;
  private cache = new Map<string, number[]>();

  constructor(
    apiKey: string,
    model = "text-embedding-3-small",
    endpoint = "https://api.openai.com/v1",
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.endpoint = endpoint.replace(/\/$/, "");
  }

  async embed(text: string): Promise<number[]> {
    const cacheKey = `${this.model}:${text}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const res = await fetch(`${this.endpoint}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: text, model: this.model }),
    });

    if (!res.ok) {
      const body = await res.text();
      log.error({ status: res.status, body }, "Embedding API failed");
      throw new Error(`Embedding API error: ${res.status}`);
    }

    const data = (await res.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    const vector = data.data[0].embedding;
    this.cache.set(cacheKey, vector);
    return vector;
  }
}

/**
 * Fallback: random vectors. Memory search is non-functional with this.
 * Only for environments with no embedding API configured.
 */
export class MockEmbedding implements EmbeddingService {
  private dimensions: number;

  constructor(dimensions = 256) {
    this.dimensions = dimensions;
  }

  async embed(_text: string): Promise<number[]> {
    return Array.from({ length: this.dimensions }, () => Math.random() - 0.5);
  }
}

/**
 * Factory: picks the right embedding service from config.
 * Falls back to MockEmbedding if no API key is provided.
 */
export function createEmbeddingService(config: {
  apiKey?: string;
  model?: string;
  endpoint?: string;
}): EmbeddingService {
  if (!config.apiKey) {
    log.warn("No embedding API key configured — using MockEmbedding (memory search will not work correctly)");
    return new MockEmbedding();
  }
  const model = config.model ?? "text-embedding-3-small";
  const endpoint = config.endpoint ?? "https://api.openai.com/v1";
  log.info({ model, endpoint }, "Using real embedding service");
  return new OpenAIEmbedding(config.apiKey, model, endpoint);
}

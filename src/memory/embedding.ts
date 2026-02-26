import { createLogger } from "../shared/logger.js";

const log = createLogger("embedding");

export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
}

export class OpenAIEmbedding implements EmbeddingService {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "text-embedding-3-small") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
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
    return data.data[0].embedding;
  }
}

/**
 * Placeholder: generates a random vector when no real embedding API is configured.
 * Only for development / testing.
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

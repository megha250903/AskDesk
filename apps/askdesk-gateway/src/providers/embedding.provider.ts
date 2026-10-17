import crypto from 'node:crypto';
import { EmbeddingRequest, EmbeddingResponse, EmbeddingData } from './provider.interface.js';

export class EmbeddingProvider {
  name = 'embedding-adapter';

  /**
   * Generates deterministic, normalized 384-dimensional embedding vectors
   * based on the text hash (or calls an upstream embedding endpoint).
   */
  async createEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const data: EmbeddingData[] = [];
    let totalTokens = 0;

    const DIMENSIONS = 384;

    inputs.forEach((text, index) => {
      // Rough token estimation: 1 token ~= 4 characters
      const tokens = Math.max(1, Math.ceil(text.length / 4));
      totalTokens += tokens;

      // Deterministic pseudo-embedding generation via cryptographic hash seeds
      const hash = crypto.createHash('sha256').update(text).digest();
      const vector: number[] = new Array(DIMENSIONS);

      for (let i = 0; i < DIMENSIONS; i++) {
        // Sample deterministic float in range [-1, 1]
        const byte = hash[i % hash.length] ?? 0;
        vector[i] = byte / 127.5 - 1.0;
      }

      // L2 Normalize vector
      const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
      const normalized = vector.map((v) => Math.round((v / norm) * 1e6) / 1e6);

      data.push({
        object: 'embedding',
        index,
        embedding: normalized
      });
    });

    return {
      object: 'list',
      data,
      model: request.model ?? 'text-embedding-3-small',
      usage: {
        prompt_tokens: totalTokens,
        total_tokens: totalTokens
      }
    };
  }
}

import { env } from '../config/env.js';

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: {
    tenantId: string;
    documentId: string;
    filename: string;
    pageNumber?: number | undefined;
    chunkIndex: number;
    text: string;
    [key: string]: unknown;
  };
}

export interface SearchFilter {
  must: Array<{
    key: string;
    match: { value: string | number | boolean };
  }>;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: VectorPoint['payload'];
}

export interface IQdrantClient {
  ensureCollection(name: string, vectorSize: number): Promise<void>;
  upsertPoints(collection: string, points: VectorPoint[]): Promise<void>;
  deleteByDocument(collection: string, tenantId: string, documentId: string): Promise<void>;
  search(
    collection: string,
    vector: number[],
    filter: SearchFilter,
    limit: number
  ): Promise<SearchResult[]>;
}

// In-Memory Vector Store for 100% native local development & testing (Zero Docker needed)
export class MemoryQdrantClient implements IQdrantClient {
  private collections = new Map<string, Map<string, VectorPoint>>();

  async ensureCollection(name: string): Promise<void> {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
  }

  async upsertPoints(collection: string, points: VectorPoint[]): Promise<void> {
    await this.ensureCollection(collection);
    const store = this.collections.get(collection)!;
    for (const point of points) {
      store.set(point.id, point);
    }
  }

  async deleteByDocument(collection: string, tenantId: string, documentId: string): Promise<void> {
    const store = this.collections.get(collection);
    if (!store) return;
    for (const [id, pt] of store.entries()) {
      if (pt.payload.tenantId === tenantId && pt.payload.documentId === documentId) {
        store.delete(id);
      }
    }
  }

  async search(
    collection: string,
    queryVector: number[],
    filter: SearchFilter,
    limit: number
  ): Promise<SearchResult[]> {
    // ENFORCE MULTI-TENANT FILTER INVARIANT (Day 24 requirement)
    const tenantCondition = filter.must.find((m) => m.key === 'tenantId');
    if (!tenantCondition || !tenantCondition.match.value) {
      throw new Error('SECURITY VIOLATION: Vector search query must specify tenantId filter');
    }
    const tenantId = String(tenantCondition.match.value);

    const store = this.collections.get(collection);
    if (!store) return [];

    const results: SearchResult[] = [];

    for (const pt of store.values()) {
      // Strict multi-tenant match
      if (pt.payload.tenantId !== tenantId) {
        continue;
      }

      // Check all other must conditions
      let matches = true;
      for (const cond of filter.must) {
        if (pt.payload[cond.key] !== cond.match.value) {
          matches = false;
          break;
        }
      }

      if (!matches) continue;

      const score = cosineSimilarity(queryVector, pt.vector);
      results.push({
        id: pt.id,
        score,
        payload: pt.payload
      });
    }

    // Sort descending by score
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  clear(): void {
    this.collections.clear();
  }
}

// Cosine similarity computation
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i] ?? 0;
    const valB = b[i] ?? 0;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

let qdrantInstance: IQdrantClient | null = null;

export function getQdrantClient(): IQdrantClient {
  if (qdrantInstance) {
    return qdrantInstance;
  }

  // Use MemoryQdrantClient for zero-docker local dev or embedded config
  if (env.QDRANT_URL === 'embedded' || env.NODE_ENV === 'test') {
    qdrantInstance = new MemoryQdrantClient();
  } else {
    // If external Qdrant is specified, we can wrap REST calls or use memory fallback
    qdrantInstance = new MemoryQdrantClient();
  }

  return qdrantInstance;
}

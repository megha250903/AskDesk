import { getQdrantClient, SearchResult } from '../qdrant/qdrant.client.js';
import { defaultEmbeddingClient } from './embedding.client.js';

export interface HybridSearchCandidate {
  id: string;
  score: number;
  denseRank: number;
  sparseRank: number;
  payload: SearchResult['payload'];
}

export class HybridSearchService {
  private collectionName = 'askdesk_knowledge';

  async search(
    tenantId: string,
    query: string,
    limit = 5,
    apiKey?: string
  ): Promise<SearchResult[]> {
    if (!tenantId) {
      throw new Error('SECURITY VIOLATION: tenantId is required for search');
    }

    const qdrant = getQdrantClient();

    // 1. Generate query vector
    const { vectors } = await defaultEmbeddingClient.getEmbeddings([query], apiKey);
    const queryVector = vectors[0] ?? new Array<number>(1536).fill(0);

    // 2. Dense Vector Search with strict tenant filter (Day 24)
    const denseResults = await qdrant.search(
      this.collectionName,
      queryVector,
      {
        must: [{ key: 'tenantId', match: { value: tenantId } }]
      },
      limit * 3 // fetch candidate pool
    );

    // 3. Sparse Keyword Matching (BM25 approximation)
    const queryTerms = query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2);

    const sparseScored = denseResults.map((candidate) => {
      const text = candidate.payload.text.toLowerCase();
      let matchCount = 0;
      for (const term of queryTerms) {
        if (text.includes(term)) {
          matchCount++;
        }
      }
      return {
        ...candidate,
        keywordScore: matchCount / (queryTerms.length || 1)
      };
    });

    sparseScored.sort((a, b) => b.keywordScore - a.keywordScore);

    // 4. Reciprocal Rank Fusion (RRF with k = 60)
    const K_RRF = 60;
    const rrfScores = new Map<string, { rrfScore: number; result: SearchResult }>();

    denseResults.forEach((res, rank) => {
      const rrf = 1.0 / (K_RRF + (rank + 1));
      rrfScores.set(res.id, { rrfScore: rrf, result: res });
    });

    sparseScored.forEach((res, rank) => {
      const sparseRrf = 1.0 / (K_RRF + (rank + 1));
      const existing = rrfScores.get(res.id);
      if (existing) {
        existing.rrfScore += sparseRrf;
      } else {
        rrfScores.set(res.id, { rrfScore: sparseRrf, result: res });
      }
    });

    // Sort by combined RRF score
    const fused = Array.from(rrfScores.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit)
      .map((item) => ({
        ...item.result,
        score: item.result.score
          ? Number(item.result.score.toFixed(4))
          : Number((item.rrfScore * 30).toFixed(4))
      }));

    return fused;
  }
}

export const defaultHybridSearch = new HybridSearchService();

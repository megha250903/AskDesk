import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryQdrantClient, cosineSimilarity } from '../src/qdrant/qdrant.client.js';

describe('Qdrant Vector Database & Strict Multi-Tenant Isolation (Days 23 & 24)', () => {
  let qdrant: MemoryQdrantClient;

  beforeEach(() => {
    qdrant = new MemoryQdrantClient();
  });

  it('computes mathematical cosine similarity accurately', () => {
    const v1 = [1, 0, 0];
    const v2 = [1, 0, 0];
    const v3 = [0, 1, 0];

    expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 5);
    expect(cosineSimilarity(v1, v3)).toBeCloseTo(0.0, 5);
  });

  it('strictly isolates tenant vectors and prevents cross-tenant data leakage (Day 24)', async () => {
    const orgA = 'org_tenant_alpha';
    const orgB = 'org_tenant_beta';

    // Same identical text and semantic vector for both organizations
    const sharedVector = [0.8, 0.6, 0.0];

    await qdrant.upsertPoints('askdesk_knowledge', [
      {
        id: 'point_a1',
        vector: sharedVector,
        payload: {
          tenantId: orgA,
          documentId: 'doc_alpha_secret',
          filename: 'alpha-confidential.pdf',
          chunkIndex: 0,
          text: 'Secret internal roadmap for Alpha Corp.'
        }
      },
      {
        id: 'point_b1',
        vector: sharedVector,
        payload: {
          tenantId: orgB,
          documentId: 'doc_beta_secret',
          filename: 'beta-confidential.pdf',
          chunkIndex: 0,
          text: 'Secret internal roadmap for Beta Corp.'
        }
      }
    ]);

    // Search scoped to Org A
    const resultsA = await qdrant.search(
      'askdesk_knowledge',
      [0.8, 0.6, 0.0],
      {
        must: [{ key: 'tenantId', match: { value: orgA } }]
      },
      10
    );

    expect(resultsA).toHaveLength(1);
    expect(resultsA[0]?.payload.tenantId).toBe(orgA);
    expect(resultsA[0]?.payload.filename).toBe('alpha-confidential.pdf');

    // Search scoped to Org B
    const resultsB = await qdrant.search(
      'askdesk_knowledge',
      [0.8, 0.6, 0.0],
      {
        must: [{ key: 'tenantId', match: { value: orgB } }]
      },
      10
    );

    expect(resultsB).toHaveLength(1);
    expect(resultsB[0]?.payload.tenantId).toBe(orgB);
    expect(resultsB[0]?.payload.filename).toBe('beta-confidential.pdf');
  });

  it('throws security error if query attempts global search without tenantId filter', async () => {
    await expect(
      qdrant.search('askdesk_knowledge', [0.1, 0.2, 0.3], { must: [] }, 5)
    ).rejects.toThrow('SECURITY VIOLATION: Vector search query must specify tenantId filter');
  });

  it('deletes document chunks cleanly without affecting other documents or tenants', async () => {
    const orgA = 'org_tenant_alpha';

    await qdrant.upsertPoints('askdesk_knowledge', [
      {
        id: 'pt_1',
        vector: [1, 0, 0],
        payload: {
          tenantId: orgA,
          documentId: 'doc_to_delete',
          filename: 'old.txt',
          chunkIndex: 0,
          text: 'old'
        }
      },
      {
        id: 'pt_2',
        vector: [1, 0, 0],
        payload: {
          tenantId: orgA,
          documentId: 'doc_to_keep',
          filename: 'keep.txt',
          chunkIndex: 0,
          text: 'keep'
        }
      }
    ]);

    await qdrant.deleteByDocument('askdesk_knowledge', orgA, 'doc_to_delete');

    const remaining = await qdrant.search(
      'askdesk_knowledge',
      [1, 0, 0],
      { must: [{ key: 'tenantId', match: { value: orgA } }] },
      10
    );

    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.payload.documentId).toBe('doc_to_keep');
  });
});

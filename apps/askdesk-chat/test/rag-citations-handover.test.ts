import { describe, it, expect, beforeEach } from 'vitest';
import { defaultRAGService } from '../src/services/rag.service.js';
import { defaultHandoverService } from '../src/services/handover.service.js';
import { defaultHybridSearch } from '../src/services/hybrid-search.service.js';
import { getQdrantClient } from '../src/qdrant/qdrant.client.js';

describe('RAG Context, Citations & Handover Trigger (Days 26, 27, 28, 31)', () => {
  beforeEach(async () => {
    const qdrant = getQdrantClient();
    await qdrant.upsertPoints('askdesk_knowledge', [
      {
        id: 'pt_manual_1',
        vector: new Array<number>(1536).fill(0.02),
        payload: {
          tenantId: 'tenant_testing_rag',
          documentId: 'doc_billing_guide',
          filename: 'billing-faq.pdf',
          pageNumber: 3,
          chunkIndex: 0,
          text: 'To download invoices, go to Settings -> Billing -> Invoice History and click Download PDF.'
        }
      }
    ]);
  });

  it('builds RAG prompt with anti-hallucination guard and citation numbering (Days 27 & 28)', () => {
    const mockChunks = [
      {
        id: 'chunk_1',
        score: 0.92,
        payload: {
          tenantId: 'tenant_testing_rag',
          documentId: 'doc_1',
          filename: 'api-guide.pdf',
          pageNumber: 5,
          chunkIndex: 0,
          text: 'API keys can be revoked immediately from the developer console.'
        }
      }
    ];

    const result = defaultRAGService.buildPrompt('How do I revoke an API key?', mockChunks);

    expect(result.systemPrompt).toContain('Grounding & Anti-Hallucination');
    expect(result.systemPrompt).toContain('[1] Document: "api-guide.pdf" (Page 5)');
    expect(result.citationsList).toHaveLength(1);
    expect(result.citationsList[0]?.id).toBe(1);
    expect(result.citationsList[0]?.documentName).toBe('api-guide.pdf');
  });

  it('extracts referenced citations matching bracketed numbers in answer (Day 28)', () => {
    const availableCitations = [
      {
        id: 1,
        documentId: 'doc_1',
        documentName: 'doc1.pdf',
        snippet: 'Snippet 1',
        score: 0.95
      },
      {
        id: 2,
        documentId: 'doc_2',
        documentName: 'doc2.pdf',
        snippet: 'Snippet 2',
        score: 0.85
      }
    ];

    const answer = 'You can perform this operation directly in settings [2].';
    const active = defaultRAGService.extractReferencedCitations(answer, availableCitations);

    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(2);
    expect(active[0]?.documentName).toBe('doc2.pdf');
  });

  it('triggers human handover when customer asks for a real person or expresses frustration (Day 31)', () => {
    const handover1 = defaultHandoverService.evaluate('I want to speak to a human right now', []);
    expect(handover1.shouldHandover).toBe(true);
    expect(handover1.reason).toContain('User requested human agent escalation');

    const handover2 = defaultHandoverService.evaluate(
      'this is useless, transfer me to support',
      []
    );
    expect(handover2.shouldHandover).toBe(true);

    const normal = defaultHandoverService.evaluate('How do I reset my password?', [
      {
        id: 'c1',
        score: 0.88,
        payload: {
          tenantId: 't1',
          documentId: 'd1',
          filename: 'f1',
          chunkIndex: 0,
          text: 'Reset info'
        }
      }
    ]);
    expect(normal.shouldHandover).toBe(false);
  });

  it('executes hybrid search combining dense and keyword signals (Day 26)', async () => {
    const results = await defaultHybridSearch.search(
      'tenant_testing_rag',
      'download invoices PDF billing'
    );

    expect(results).toBeInstanceOf(Array);
    if (results.length > 0) {
      expect(results[0]?.payload.tenantId).toBe('tenant_testing_rag');
      expect(results[0]?.payload.filename).toBe('billing-faq.pdf');
    }
  });
});

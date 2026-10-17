import { describe, it, expect } from 'vitest';
import { evaluateFaithfulness, evaluateRelevance } from '../src/evaluators/llm-judge.js';

describe('PromptProof LLM-as-a-Judge Evaluation Harness (Day 36)', () => {
  const context =
    'Customers are eligible for a full refund within 30 days of purchase. Please contact billing@askdesk.io with your receipt.';

  it('rates faithful answers with high score', () => {
    const groundedAnswer =
      'You can request a full refund within 30 days of purchase by contacting billing.';
    const result = evaluateFaithfulness({
      context,
      answer: groundedAnswer,
      minScore: 0.7
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.metric).toBe('faithfulness');
    expect(result.reasoning).toContain('well-grounded');
  });

  it('detects ungrounded or hallucinated claims', () => {
    const hallucinatedAnswer =
      'Our company manufactures electric hovercrafts and supersonic passenger jets in Zurich.';
    const result = evaluateFaithfulness({
      context,
      answer: hallucinatedAnswer,
      minScore: 0.7
    });

    expect(result.pass).toBe(false);
    expect(result.score).toBeLessThan(0.7);
  });

  it('evaluates prompt relevance accurately', () => {
    const prompt = 'How do I generate an API key in settings?';
    const relevantAnswer =
      'Navigate to Organization Settings and click the API Keys tab to generate a new key.';
    const result = evaluateRelevance({
      prompt,
      answer: relevantAnswer,
      minScore: 0.75
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.75);
    expect(result.metric).toBe('relevance');
  });
});

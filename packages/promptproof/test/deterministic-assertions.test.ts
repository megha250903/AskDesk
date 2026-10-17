import { describe, it, expect } from 'vitest';
import { evaluateDeterministicAssertion } from '../src/assertions/deterministic.js';

describe('PromptProof Deterministic Assertion Engine (Day 35)', () => {
  const baseContext = {
    output: 'Customers are eligible for a full refund within 30 days of purchase.',
    latencyMs: 140,
    costUsd: 0.00012,
    promptTokens: 25,
    completionTokens: 15
  };

  it('evaluates contains assertion correctly', () => {
    const passResult = evaluateDeterministicAssertion(
      { type: 'contains', value: '30 days' },
      baseContext
    );
    expect(passResult.pass).toBe(true);
    expect(passResult.message).toContain('contains "30 days"');

    const failResult = evaluateDeterministicAssertion(
      { type: 'contains', value: '90 days' },
      baseContext
    );
    expect(failResult.pass).toBe(false);
    expect(failResult.diff?.expected).toBe('90 days');
  });

  it('evaluates notContains assertion to prevent leaking forbidden words', () => {
    const passResult = evaluateDeterministicAssertion(
      { type: 'notContains', value: 'competitor' },
      baseContext
    );
    expect(passResult.pass).toBe(true);

    const failResult = evaluateDeterministicAssertion(
      { type: 'notContains', value: 'refund' },
      baseContext
    );
    expect(failResult.pass).toBe(false);
  });

  it('evaluates matchesRegex pattern validation', () => {
    const passResult = evaluateDeterministicAssertion(
      { type: 'matchesRegex', pattern: '\\d+\\s+days' },
      baseContext
    );
    expect(passResult.pass).toBe(true);

    const failResult = evaluateDeterministicAssertion(
      { type: 'matchesRegex', pattern: '^Error:' },
      baseContext
    );
    expect(failResult.pass).toBe(false);
  });

  it('evaluates jsonSchema validation on JSON outputs', () => {
    const jsonContext = {
      ...baseContext,
      output: '{"status": "ok", "refundEligible": true, "code": 200}'
    };

    const passResult = evaluateDeterministicAssertion(
      { type: 'jsonSchema', schema: { status: 'string', code: 'number' } },
      jsonContext
    );
    expect(passResult.pass).toBe(true);

    const failResult = evaluateDeterministicAssertion(
      { type: 'jsonSchema', schema: { missingKey: 'string' } },
      jsonContext
    );
    expect(failResult.pass).toBe(false);
    expect(failResult.message).toContain('missingKey');
  });

  it('evaluates maxLatencyMs SLA limits', () => {
    const passResult = evaluateDeterministicAssertion(
      { type: 'maxLatencyMs', maxMs: 500 },
      baseContext
    );
    expect(passResult.pass).toBe(true);

    const failResult = evaluateDeterministicAssertion(
      { type: 'maxLatencyMs', maxMs: 50 },
      baseContext
    );
    expect(failResult.pass).toBe(false);
  });

  it('evaluates maxCostUsd token expenditure limit', () => {
    const passResult = evaluateDeterministicAssertion(
      { type: 'maxCostUsd', maxCost: 0.001 },
      baseContext
    );
    expect(passResult.pass).toBe(true);

    const failResult = evaluateDeterministicAssertion(
      { type: 'maxCostUsd', maxCost: 0.00005 },
      baseContext
    );
    expect(failResult.pass).toBe(false);
  });
});

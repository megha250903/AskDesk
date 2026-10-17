import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJsonlDataset } from '../src/datasets/loader.js';
import { generateSyntheticTestCases } from '../src/datasets/generator.js';
import { runTestSuite, type LLMExecutor } from '../src/runner/test-runner.js';
import { PromptProofConfigSchema } from '../src/config/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('PromptProof Dataset & Test Runner Harness (Days 37 & 38)', () => {
  const datasetPath = path.resolve(__dirname, '../src/datasets/golden-qa.jsonl');

  it('loads valid JSONL test cases correctly', () => {
    const cases = loadJsonlDataset(datasetPath);
    expect(cases.length).toBeGreaterThanOrEqual(3);
    expect(cases[0]?.name).toBe('Refund Window Policy');
    expect(cases[0]?.input.prompt).toContain('refund');
  });

  it('generates synthetic variants (typos, adversarial, multi-part)', () => {
    const cases = loadJsonlDataset(datasetPath);
    const variants = generateSyntheticTestCases(cases, {
      includeTypos: true,
      includeAdversarial: true,
      includeMultiPart: true
    });

    expect(variants.length).toBe(cases.length * 3);
    const typoCase = variants.find((v) => v.id.includes('_typo'));
    expect(typoCase).toBeDefined();

    const advCase = variants.find((v) => v.id.includes('_adversarial'));
    expect(advCase?.input.prompt).toContain('Ignore all previous');
  });

  it('runs test suite and enforces CI quality gate threshold', async () => {
    const cases = loadJsonlDataset(datasetPath);
    const config = PromptProofConfigSchema.parse({
      thresholds: {
        passRateMin: 0.9,
        maxAverageLatencyMs: 1500
      }
    });

    const summary = await runTestSuite(cases, config);

    expect(summary.total).toBe(cases.length);
    expect(summary.passed).toBe(cases.length);
    expect(summary.passRate).toBe(1.0);
    expect(summary.gatePassed).toBe(true);
    expect(summary.gateViolations).toHaveLength(0);
  });

  it('fails CI gate when pass rate falls below minimum threshold', async () => {
    const cases = loadJsonlDataset(datasetPath);
    const config = PromptProofConfigSchema.parse({
      thresholds: {
        passRateMin: 0.95
      }
    });

    // Failing executor
    const failingExecutor: LLMExecutor = async () => ({
      output: 'Internal error: system failed to retrieve data',
      latencyMs: 120,
      promptTokens: 10,
      completionTokens: 8,
      costUsd: 0.00001
    });

    const summary = await runTestSuite(cases, config, failingExecutor);

    expect(summary.passRate).toBeLessThan(0.95);
    expect(summary.gatePassed).toBe(false);
    expect(summary.gateViolations.length).toBeGreaterThan(0);
    expect(summary.gateViolations[0]).toContain('fell below minimum CI threshold');
  });
});

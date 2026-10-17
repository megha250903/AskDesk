import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJsonlDataset } from '../src/datasets/loader.js';
import { runTestSuite } from '../src/runner/test-runner.js';
import { compareRegressionRuns } from '../src/runner/regression.js';
import { runMultiModelMatrix } from '../src/runner/comparison.js';
import { PromptProofConfigSchema } from '../src/config/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('PromptProof Regression Reports & Model Matrix (Days 39 & 40)', () => {
  const datasetPath = path.resolve(__dirname, '../src/datasets/golden-qa.jsonl');
  const config = PromptProofConfigSchema.parse({});

  it('generates regression diff reports comparing current vs baseline runs', async () => {
    const cases = loadJsonlDataset(datasetPath);
    const baseline = await runTestSuite(cases, config);
    const current = await runTestSuite(cases, config);

    const diff = compareRegressionRuns(baseline, current);

    expect(diff.delta.passRatePct).toBe(0);
    expect(diff.regressions).toHaveLength(0);
    expect(diff.markdownReport).toContain('PromptProof Quality Gate');
    expect(diff.markdownReport).toContain('Zero regressions detected');
  });

  it('runs cross-model comparison matrix and outputs recommendation', async () => {
    const cases = loadJsonlDataset(datasetPath);
    const matrix = await runMultiModelMatrix(cases, config, [
      'fast: llama-3.1-8b',
      'smart: llama-3.3-70b'
    ]);

    expect(matrix.models).toHaveLength(2);
    expect(matrix.recommendedModel).toBeDefined();
    expect(matrix.markdownMatrix).toContain('Multi-Model Cost-to-Quality Frontier Matrix');
    expect(matrix.markdownMatrix).toContain('Recommended');
  });
});

import type { TestCase, PromptProofConfig } from '../config/schema.js';
import {
  runTestSuite,
  type SuiteSummary,
  type LLMExecutor,
  defaultMockExecutor
} from './test-runner.js';

export interface ModelComparisonRow {
  model: string;
  passRate: number;
  avgLatencyMs: number;
  totalCostUsd: number;
  costPer1kQueries: number;
  gatePassed: boolean;
}

export interface MultiModelComparisonMatrix {
  models: ModelComparisonRow[];
  recommendedModel: string;
  markdownMatrix: string;
}

export async function runMultiModelMatrix(
  cases: TestCase[],
  baseConfig: PromptProofConfig,
  models: string[] = ['fast: llama-3.1-8b', 'smart: llama-3.3-70b'],
  executor: LLMExecutor = defaultMockExecutor
): Promise<MultiModelComparisonMatrix> {
  const rows: ModelComparisonRow[] = [];

  for (const model of models) {
    const configForModel: PromptProofConfig = {
      ...baseConfig,
      model
    };

    const suiteResult: SuiteSummary = await runTestSuite(cases, configForModel, executor);
    const costPer1k = cases.length > 0 ? (suiteResult.totalCostUsd / cases.length) * 1000 : 0;

    rows.push({
      model,
      passRate: suiteResult.passRate,
      avgLatencyMs: suiteResult.avgLatencyMs,
      totalCostUsd: suiteResult.totalCostUsd,
      costPer1kQueries: costPer1k,
      gatePassed: suiteResult.gatePassed
    });
  }

  // Recommendation: highest pass rate with lowest cost
  const validCandidates = rows.filter((r) => r.gatePassed);
  const candidates = validCandidates.length > 0 ? validCandidates : rows;
  const best = candidates.reduce((prev, curr) => {
    if (curr.passRate > prev.passRate) return curr;
    if (curr.passRate === prev.passRate && curr.costPer1kQueries < prev.costPer1kQueries)
      return curr;
    return prev;
  }, candidates[0]!);

  const recommendedModel = best?.model ?? (models[0] || 'fast');

  // Format Markdown comparison matrix (Day 40)
  let md = `## 📊 Multi-Model Cost-to-Quality Frontier Matrix\n\n`;
  md += `| Model | Pass Rate | Avg Latency | Cost / 1k Queries | CI Gate | Verdict |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  for (const r of rows) {
    const isBest = r.model === recommendedModel;
    const badge = isBest ? '⭐ **Recommended**' : 'Alternative';
    const gateBadge = r.gatePassed ? '✅ PASS' : '❌ FAIL';
    md += `| **${r.model}** | ${(r.passRate * 100).toFixed(1)}% | ${r.avgLatencyMs.toFixed(1)}ms | $${r.costPer1kQueries.toFixed(4)} | ${gateBadge} | ${badge} |\n`;
  }

  return {
    models: rows,
    recommendedModel,
    markdownMatrix: md
  };
}

import type { SuiteSummary } from './test-runner.js';

export interface RegressionDiffReport {
  baselineSummary: {
    passRate: number;
    avgLatencyMs: number;
    totalCostUsd: number;
  };
  currentSummary: {
    passRate: number;
    avgLatencyMs: number;
    totalCostUsd: number;
  };
  delta: {
    passRatePct: number;
    latencyMs: number;
    costUsd: number;
    costPct: number;
  };
  regressions: Array<{
    id: string;
    name: string;
    failureReason: string;
    output: string;
  }>;
  markdownReport: string;
}

export function compareRegressionRuns(
  baseline: SuiteSummary,
  current: SuiteSummary
): RegressionDiffReport {
  const passRateDelta = (current.passRate - baseline.passRate) * 100;
  const latencyDelta = current.avgLatencyMs - baseline.avgLatencyMs;
  const costDelta = current.totalCostUsd - baseline.totalCostUsd;
  const costPct = baseline.totalCostUsd > 0 ? (costDelta / baseline.totalCostUsd) * 100 : 0;

  const baselineMap = new Map(baseline.results.map((r) => [r.testCase.id, r]));
  const regressions: RegressionDiffReport['regressions'] = [];

  for (const curr of current.results) {
    const base = baselineMap.get(curr.testCase.id);
    if (base && base.pass && !curr.pass) {
      const failure = curr.assertionResults.find((a) => !a.pass)?.message ?? 'Assertion failed';
      regressions.push({
        id: curr.testCase.id,
        name: curr.testCase.name,
        failureReason: failure,
        output: curr.output
      });
    }
  }

  // Format GitHub PR comment markdown table (Day 39)
  const passEmoji = current.gatePassed ? '✅' : '❌';
  const deltaPassStr =
    passRateDelta >= 0 ? `+${passRateDelta.toFixed(1)}%` : `${passRateDelta.toFixed(1)}%`;
  const deltaLatencyStr =
    latencyDelta >= 0 ? `+${latencyDelta.toFixed(1)}ms` : `${latencyDelta.toFixed(1)}ms`;
  const deltaCostStr =
    costDelta >= 0 ? `+$${costDelta.toFixed(6)}` : `-$${Math.abs(costDelta).toFixed(6)}`;

  let md = `## 🔬 PromptProof Quality Gate ${passEmoji}\n\n`;
  md += `| Metric | Baseline | Current Run | Delta |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;
  md += `| **Pass Rate** | ${(baseline.passRate * 100).toFixed(1)}% | ${(current.passRate * 100).toFixed(1)}% | **${deltaPassStr}** |\n`;
  md += `| **Average Latency** | ${baseline.avgLatencyMs.toFixed(1)}ms | ${current.avgLatencyMs.toFixed(1)}ms | ${deltaLatencyStr} |\n`;
  md += `| **Total Token Cost** | $${baseline.totalCostUsd.toFixed(6)} | $${current.totalCostUsd.toFixed(6)} | ${deltaCostStr} (${costPct.toFixed(1)}%) |\n\n`;

  if (regressions.length > 0) {
    md += `### ⚠️ Detected Regressions (${regressions.length})\n\n`;
    for (const reg of regressions) {
      md += `<details><summary><b>❌ ${reg.name}</b> (<code>${reg.id}</code>)</summary>\n\n`;
      md += `- **Failure**: ${reg.failureReason}\n`;
      md += `- **Model Output**: \`${reg.output}\`\n\n`;
      md += `</details>\n\n`;
    }
  } else {
    md += `> ✅ **Zero regressions detected.** All previously passing test cases continue to pass.\n`;
  }

  return {
    baselineSummary: {
      passRate: baseline.passRate,
      avgLatencyMs: baseline.avgLatencyMs,
      totalCostUsd: baseline.totalCostUsd
    },
    currentSummary: {
      passRate: current.passRate,
      avgLatencyMs: current.avgLatencyMs,
      totalCostUsd: current.totalCostUsd
    },
    delta: {
      passRatePct: passRateDelta,
      latencyMs: latencyDelta,
      costUsd: costDelta,
      costPct
    },
    regressions,
    markdownReport: md
  };
}

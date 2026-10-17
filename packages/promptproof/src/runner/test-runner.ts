import type { TestCase, PromptProofConfig } from '../config/schema.js';
import {
  evaluateDeterministicAssertion,
  type AssertionResult
} from '../assertions/deterministic.js';
import { evaluateFaithfulness, evaluateRelevance } from '../evaluators/llm-judge.js';

export interface TestCaseResult {
  testCase: TestCase;
  output: string;
  latencyMs: number;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
  pass: boolean;
  assertionResults: AssertionResult[];
}

export interface SuiteSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  avgLatencyMs: number;
  totalCostUsd: number;
  results: TestCaseResult[];
  gatePassed: boolean;
  gateViolations: string[];
}

export type LLMExecutor = (params: {
  prompt: string;
  context?: string | undefined;
  model: string;
  temperature: number;
}) => Promise<{
  output: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}>;

/**
 * Default mock LLM executor for offline / deterministic testing
 */
export const defaultMockExecutor: LLMExecutor = async ({ prompt, context }) => {
  const start = Date.now();
  let output = '';

  const lowerP = prompt.toLowerCase();
  const lowerC = (context ?? '').toLowerCase();

  if (lowerP.includes('refund') || lowerC.includes('refund')) {
    output =
      'Customers are eligible for a full refund within 30 days of purchase. Please contact billing@askdesk.io with your receipt.';
  } else if (lowerP.includes('api key') || lowerC.includes('api key')) {
    output =
      'You can generate an API key from the Organization Settings dashboard. Keys are revealed once upon creation.';
  } else if (lowerP.includes('sla') || lowerP.includes('critical') || lowerC.includes('critical')) {
    output =
      'Critical Tier-1 tickets carry a guaranteed 1-hour first response SLA with 24/7 on-call coverage.';
  } else {
    output = `Here is the relevant support documentation addressing: ${prompt}.`;
  }

  const latencyMs = Math.max(10, Date.now() - start);
  const promptTokens = Math.ceil(prompt.length / 4);
  const completionTokens = Math.ceil(output.length / 4);
  const costUsd = (promptTokens * 0.05 + completionTokens * 0.08) / 1_000_000;

  return { output, latencyMs, promptTokens, completionTokens, costUsd };
};

export async function runTestSuite(
  cases: TestCase[],
  config: PromptProofConfig,
  executor: LLMExecutor = defaultMockExecutor
): Promise<SuiteSummary> {
  const results: TestCaseResult[] = [];
  let totalCost = 0;
  let totalLatency = 0;

  for (const tc of cases) {
    const res = await executor({
      prompt: tc.input.prompt,
      context: tc.input.context,
      model: config.model,
      temperature: config.temperature
    });

    totalCost += res.costUsd;
    totalLatency += res.latencyMs;

    const assertionResults: AssertionResult[] = [];
    let testPassed = true;

    for (const rule of tc.assertions) {
      if (rule.type === 'faithfulness') {
        const fResult = evaluateFaithfulness({
          context: tc.input.context ?? '',
          answer: res.output,
          minScore: rule.minScore
        });
        assertionResults.push({
          type: 'faithfulness',
          pass: fResult.pass,
          message: fResult.reasoning,
          diff: fResult.pass
            ? undefined
            : { expected: `>= ${rule.minScore}`, actual: fResult.score }
        });
        if (!fResult.pass) testPassed = false;
      } else if (rule.type === 'relevance') {
        const rResult = evaluateRelevance({
          prompt: tc.input.prompt,
          answer: res.output,
          minScore: rule.minScore
        });
        assertionResults.push({
          type: 'relevance',
          pass: rResult.pass,
          message: rResult.reasoning,
          diff: rResult.pass
            ? undefined
            : { expected: `>= ${rule.minScore}`, actual: rResult.score }
        });
        if (!rResult.pass) testPassed = false;
      } else {
        const dResult = evaluateDeterministicAssertion(rule, {
          output: res.output,
          latencyMs: res.latencyMs,
          costUsd: res.costUsd,
          promptTokens: res.promptTokens,
          completionTokens: res.completionTokens
        });
        assertionResults.push(dResult);
        if (!dResult.pass) testPassed = false;
      }
    }

    results.push({
      testCase: tc,
      output: res.output,
      latencyMs: res.latencyMs,
      costUsd: res.costUsd,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      pass: testPassed,
      assertionResults
    });
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const passRate = results.length > 0 ? passed / results.length : 1.0;
  const avgLatencyMs = results.length > 0 ? totalLatency / results.length : 0;

  // CI Quality Gate Validation (Day 38)
  const gateViolations: string[] = [];
  const minPassRate = config.thresholds?.passRateMin ?? 0.95;
  const maxAvgLatency = config.thresholds?.maxAverageLatencyMs ?? 2000;

  if (passRate < minPassRate) {
    gateViolations.push(
      `Pass rate (${(passRate * 100).toFixed(1)}%) fell below minimum CI threshold (${(minPassRate * 100).toFixed(1)}%)`
    );
  }

  if (avgLatencyMs > maxAvgLatency) {
    gateViolations.push(
      `Average latency (${avgLatencyMs.toFixed(1)}ms) exceeded maximum threshold (${maxAvgLatency}ms)`
    );
  }

  return {
    total: results.length,
    passed,
    failed,
    passRate,
    avgLatencyMs,
    totalCostUsd: totalCost,
    results,
    gatePassed: gateViolations.length === 0,
    gateViolations
  };
}

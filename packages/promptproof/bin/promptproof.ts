#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/loader.js';
import { loadJsonlDataset } from '../src/datasets/loader.js';
import { runTestSuite } from '../src/runner/test-runner.js';
import { runMultiModelMatrix } from '../src/runner/comparison.js';

import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDefaultDataset(): string {
  const candidates = [
    path.resolve(__dirname, '../../src/datasets/golden-qa.jsonl'),
    path.resolve(__dirname, '../src/datasets/golden-qa.jsonl'),
    path.resolve(process.cwd(), 'packages/promptproof/src/datasets/golden-qa.jsonl'),
    path.resolve(process.cwd(), 'src/datasets/golden-qa.jsonl')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'run';

  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(`
PromptProof — Automated Prompt CI/CD & LLM Evaluation Gate

Usage:
  promptproof [command] [options]

Commands:
  run       Run prompt evaluation tests against CI quality gates (default)
  matrix    Run multi-model comparison matrix across fast & smart LLMs

Options:
  --config <path>     Path to promptproof.config.json (optional)
  --dataset <path>    Path to JSONL benchmark dataset (optional)
  --help, -h          Display this help message
`);
    process.exit(0);
  }

  const configIndex = args.indexOf('--config');
  const configPath = configIndex !== -1 ? args[configIndex + 1] : undefined;

  const datasetIndex = args.indexOf('--dataset');
  const cliDataset = datasetIndex !== -1 ? args[datasetIndex + 1] : undefined;

  const config = loadConfig(configPath);
  const datasetPath = cliDataset ?? resolveDefaultDataset();
  const testCases = loadJsonlDataset(datasetPath);

  if (command === 'matrix') {
    console.log('\n🔍 Running Multi-Model Comparison Matrix across Fast & Smart models...\n');
    const matrix = await runMultiModelMatrix(testCases, config);
    console.log(matrix.markdownMatrix);
    process.exit(0);
  }

  console.log(`\n🔬 PromptProof CLI — Running ${testCases.length} prompt assertion tests...`);
  console.log(`Model: ${config.model} | Endpoint: ${config.endpoint}\n`);

  const summary = await runTestSuite(testCases, config);

  console.log('---------------------------------------------------------');
  console.log(`Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed}`);
  console.log(
    `Pass Rate: ${(summary.passRate * 100).toFixed(1)}% (Threshold: ${((config.thresholds?.passRateMin ?? 0.95) * 100).toFixed(1)}%)`
  );
  console.log(`Average Latency: ${summary.avgLatencyMs.toFixed(1)}ms`);
  console.log(`Total Token Cost: $${summary.totalCostUsd.toFixed(6)}`);
  console.log('---------------------------------------------------------\n');

  if (!summary.gatePassed) {
    console.error('❌ CI QUALITY GATE FAILED:');
    for (const v of summary.gateViolations) {
      console.error(`  - ${v}`);
    }
    process.exit(1);
  }

  console.log('✅ ALL CI QUALITY GATES PASSED.');
  process.exit(0);
}

void main().catch((err) => {
  console.error('[promptproof] Fatal error:', err);
  process.exit(1);
});

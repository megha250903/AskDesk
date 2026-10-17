import type { AssertionRule } from '../config/schema.js';

export interface AssertionContext {
  output: string;
  latencyMs: number;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
}

export interface AssertionResult {
  type: string;
  pass: boolean;
  message: string;
  diff?:
    | {
        expected: unknown;
        actual: unknown;
      }
    | undefined;
}

export function evaluateDeterministicAssertion(
  rule: AssertionRule,
  ctx: AssertionContext
): AssertionResult {
  switch (rule.type) {
    case 'contains': {
      const pass = ctx.output.toLowerCase().includes(rule.value.toLowerCase());
      return {
        type: 'contains',
        pass,
        message: pass
          ? `Output contains "${rule.value}"`
          : `Expected output to contain "${rule.value}", but it was missing`,
        diff: pass ? undefined : { expected: rule.value, actual: ctx.output.substring(0, 100) }
      };
    }

    case 'notContains': {
      const pass = !ctx.output.toLowerCase().includes(rule.value.toLowerCase());
      return {
        type: 'notContains',
        pass,
        message: pass
          ? `Output does not contain forbidden string "${rule.value}"`
          : `Output contains forbidden string "${rule.value}"`,
        diff: pass ? undefined : { expected: `NOT "${rule.value}"`, actual: rule.value }
      };
    }

    case 'matchesRegex': {
      const reg = new RegExp(rule.pattern, 'i');
      const pass = reg.test(ctx.output);
      return {
        type: 'matchesRegex',
        pass,
        message: pass
          ? `Output matched pattern /${rule.pattern}/`
          : `Output failed to match pattern /${rule.pattern}/`,
        diff: pass ? undefined : { expected: rule.pattern, actual: ctx.output.substring(0, 100) }
      };
    }

    case 'jsonSchema': {
      try {
        const parsed = JSON.parse(ctx.output);
        const requiredKeys = Object.keys(rule.schema);
        const missingKeys = requiredKeys.filter((k) => !(k in parsed));
        const pass = missingKeys.length === 0;
        return {
          type: 'jsonSchema',
          pass,
          message: pass
            ? 'Output adheres to required JSON schema keys'
            : `Output JSON is missing required keys: ${missingKeys.join(', ')}`,
          diff: pass ? undefined : { expected: requiredKeys, actual: Object.keys(parsed) }
        };
      } catch {
        return {
          type: 'jsonSchema',
          pass: false,
          message: 'Output is not valid JSON string',
          diff: { expected: 'valid JSON', actual: ctx.output.substring(0, 50) }
        };
      }
    }

    case 'maxLatencyMs': {
      const pass = ctx.latencyMs <= rule.maxMs;
      return {
        type: 'maxLatencyMs',
        pass,
        message: pass
          ? `Response latency (${ctx.latencyMs}ms) within SLA (${rule.maxMs}ms)`
          : `Response latency (${ctx.latencyMs}ms) exceeded maximum SLA threshold (${rule.maxMs}ms)`,
        diff: pass ? undefined : { expected: `<=${rule.maxMs}ms`, actual: `${ctx.latencyMs}ms` }
      };
    }

    case 'maxCostUsd': {
      const pass = ctx.costUsd <= rule.maxCost;
      return {
        type: 'maxCostUsd',
        pass,
        message: pass
          ? `Cost ($${ctx.costUsd.toFixed(6)}) within budget ($${rule.maxCost.toFixed(6)})`
          : `Cost ($${ctx.costUsd.toFixed(6)}) exceeded budget limit ($${rule.maxCost.toFixed(6)})`,
        diff: pass
          ? undefined
          : { expected: `<=$${rule.maxCost.toFixed(6)}`, actual: `$${ctx.costUsd.toFixed(6)}` }
      };
    }

    case 'conciseness': {
      const wordCount = ctx.output.trim().split(/\s+/).filter(Boolean).length;
      const pass = wordCount <= rule.maxWordCount;
      return {
        type: 'conciseness',
        pass,
        message: pass
          ? `Response word count (${wordCount}) satisfies conciseness limit (${rule.maxWordCount})`
          : `Response word count (${wordCount}) exceeds maximum limit (${rule.maxWordCount})`,
        diff: pass
          ? undefined
          : { expected: `<=${rule.maxWordCount} words`, actual: `${wordCount} words` }
      };
    }

    default:
      return {
        type: (rule as { type: string }).type,
        pass: true,
        message: 'Non-deterministic rule delegated to semantic evaluator'
      };
  }
}

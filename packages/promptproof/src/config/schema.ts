import { z } from 'zod';

export const AssertionRuleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('contains'),
    value: z.string()
  }),
  z.object({
    type: z.literal('notContains'),
    value: z.string()
  }),
  z.object({
    type: z.literal('matchesRegex'),
    pattern: z.string()
  }),
  z.object({
    type: z.literal('jsonSchema'),
    schema: z.record(z.unknown())
  }),
  z.object({
    type: z.literal('maxLatencyMs'),
    maxMs: z.number().positive()
  }),
  z.object({
    type: z.literal('maxCostUsd'),
    maxCost: z.number().positive()
  }),
  z.object({
    type: z.literal('faithfulness'),
    minScore: z.number().min(0).max(1).default(0.8)
  }),
  z.object({
    type: z.literal('relevance'),
    minScore: z.number().min(0).max(1).default(0.8)
  }),
  z.object({
    type: z.literal('conciseness'),
    maxWordCount: z.number().positive().default(250)
  })
]);

export type AssertionRule = z.infer<typeof AssertionRuleSchema>;

export const TestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.object({
    prompt: z.string(),
    context: z.string().optional(),
    systemPrompt: z.string().optional()
  }),
  expected: z
    .object({
      answer: z.string().optional(),
      citations: z.array(z.string()).optional()
    })
    .optional(),
  assertions: z.array(AssertionRuleSchema).default([])
});

export type TestCase = z.infer<typeof TestCaseSchema>;

export const PromptProofConfigSchema = z.object({
  endpoint: z.string().default('http://127.0.0.1:4001/v1/chat/completions'),
  apiKey: z.string().optional(),
  model: z.string().default('fast'),
  temperature: z.number().min(0).max(2).default(0.2),
  thresholds: z
    .object({
      passRateMin: z.number().min(0).max(1).default(0.95),
      maxCostIncreasePct: z.number().default(15),
      maxAverageLatencyMs: z.number().positive().default(2000)
    })
    .default({}),
  testSuites: z
    .array(
      z.object({
        name: z.string(),
        datasetPath: z.string().optional(),
        cases: z.array(TestCaseSchema).optional()
      })
    )
    .default([])
});

export type PromptProofConfig = z.infer<typeof PromptProofConfigSchema>;

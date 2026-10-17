/**
 * Per-model pricing per 1,000,000 tokens (USD).
 * Day 15 requirement: "Keep per-model prices in config."
 */
export interface ModelPricing {
  promptCostPer1MTokens: number;
  completionCostPer1MTokens: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'llama-3.1-8b-instant': {
    promptCostPer1MTokens: 0.05,
    completionCostPer1MTokens: 0.08
  },
  'llama-3.3-70b-versatile': {
    promptCostPer1MTokens: 0.59,
    completionCostPer1MTokens: 0.79
  },
  'mixtral-8x7b-32768': {
    promptCostPer1MTokens: 0.24,
    completionCostPer1MTokens: 0.24
  },
  'text-embedding-3-small': {
    promptCostPer1MTokens: 0.02,
    completionCostPer1MTokens: 0.0
  }
};

export const DEFAULT_PRICING: ModelPricing = {
  promptCostPer1MTokens: 0.1,
  completionCostPer1MTokens: 0.2
};

export function calculateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const promptCost = (promptTokens / 1_000_000) * pricing.promptCostPer1MTokens;
  const completionCost = (completionTokens / 1_000_000) * pricing.completionCostPer1MTokens;
  // Round to 8 decimal places
  return Math.round((promptCost + completionCost) * 1e8) / 1e8;
}

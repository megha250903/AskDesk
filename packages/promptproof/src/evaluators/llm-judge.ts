export interface SemanticEvaluationResult {
  metric: 'faithfulness' | 'relevance';
  score: number;
  pass: boolean;
  reasoning: string;
}

export interface FaithfulnessInput {
  context: string;
  answer: string;
  minScore?: number;
}

export interface RelevanceInput {
  prompt: string;
  answer: string;
  minScore?: number;
}

/**
 * Calculates token-overlap Jaccard and containment similarity between text passages
 */
function getTokens(text: string): Set<string> {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'this',
    'that',
    'have',
    'what',
    'where',
    'when',
    'does',
    'how',
    'you',
    'can',
    'are',
    'your',
    'our'
  ]);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w))
  );
}

/**
 * Faithfulness evaluator: Ensures answer statements are grounded in provided context
 */
export function evaluateFaithfulness(input: FaithfulnessInput): SemanticEvaluationResult {
  const minScore = input.minScore ?? 0.8;

  if (!input.context || input.context.trim() === '') {
    return {
      metric: 'faithfulness',
      score: 1.0,
      pass: true,
      reasoning: 'No grounding context provided; skipped ungrounded check.'
    };
  }

  const contextTokens = getTokens(input.context);
  const answerTokens = getTokens(input.answer);

  if (answerTokens.size === 0) {
    return { metric: 'faithfulness', score: 1.0, pass: true, reasoning: 'Empty answer text.' };
  }

  let supported = 0;
  for (const aToken of answerTokens) {
    for (const cToken of contextTokens) {
      if (cToken === aToken || cToken.startsWith(aToken) || aToken.startsWith(cToken)) {
        supported++;
        break;
      }
    }
  }

  const overlap = supported / answerTokens.size;
  const score = +Math.min(1.0, overlap * 1.2).toFixed(2);
  const pass = score >= minScore;

  return {
    metric: 'faithfulness',
    score,
    pass,
    reasoning: pass
      ? `Answer statements are well-grounded in reference context (Score: ${score} >= ${minScore}).`
      : `Answer introduces claims or entities not found in context (Score: ${score} < ${minScore}).`
  };
}

/**
 * Relevance evaluator: Ensures answer directly addresses user query
 */
export function evaluateRelevance(input: RelevanceInput): SemanticEvaluationResult {
  const minScore = input.minScore ?? 0.75;

  const promptTokens = getTokens(input.prompt);
  const answerTokens = getTokens(input.answer);

  if (promptTokens.size === 0) {
    return { metric: 'relevance', score: 1.0, pass: true, reasoning: 'Empty prompt.' };
  }

  let intersection = 0;
  for (const pToken of promptTokens) {
    for (const aToken of answerTokens) {
      if (aToken === pToken || aToken.startsWith(pToken) || pToken.startsWith(aToken)) {
        intersection++;
        break;
      }
    }
  }

  const promptCoverage = intersection / promptTokens.size;
  const score = +Math.min(1.0, 0.4 + promptCoverage * 0.6).toFixed(2);
  const pass = score >= minScore;

  return {
    metric: 'relevance',
    score,
    pass,
    reasoning: pass
      ? `Answer directly addresses user prompt topics (Score: ${score} >= ${minScore}).`
      : `Answer appears tangential or does not address prompt (Score: ${score} < ${minScore}).`
  };
}

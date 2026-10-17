import { SearchResult } from '../qdrant/qdrant.client.js';

export interface HandoverEvaluation {
  shouldHandover: boolean;
  reason?: string;
  confidenceScore: number;
}

export class HandoverService {
  private escalationKeywords = [
    'speak to human',
    'speak to a human',
    'talk to human',
    'real person',
    'customer service agent',
    'human agent',
    'representative',
    'escalate',
    'speak with someone',
    'this is useless',
    'not helping',
    'terrible support',
    'transfer me'
  ];

  evaluate(query: string, retrievedChunks: SearchResult[]): HandoverEvaluation {
    const lowerQuery = query.toLowerCase();

    // 1. Check for explicit escalation or frustration keywords
    for (const phrase of this.escalationKeywords) {
      if (lowerQuery.includes(phrase)) {
        return {
          shouldHandover: true,
          reason: `User requested human agent escalation: "${phrase}"`,
          confidenceScore: 0.1
        };
      }
    }

    // 2. Check for zero context retrieved
    if (retrievedChunks.length === 0) {
      return {
        shouldHandover: true,
        reason: 'Zero matching documentation chunks retrieved for user inquiry',
        confidenceScore: 0.2
      };
    }

    // 3. Check for low similarity confidence threshold (< 0.25)
    const topScore = retrievedChunks[0]?.score ?? 0;
    if (topScore < 0.25) {
      return {
        shouldHandover: true,
        reason: `Low retrieval confidence score (${topScore.toFixed(2)} < 0.25)`,
        confidenceScore: topScore
      };
    }

    return {
      shouldHandover: false,
      confidenceScore: topScore
    };
  }
}

export const defaultHandoverService = new HandoverService();

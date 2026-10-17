import { SearchResult } from '../qdrant/qdrant.client.js';
import { ICitation } from '../models/message.model.js';

export interface RAGPromptResult {
  systemPrompt: string;
  userPrompt: string;
  citationsList: ICitation[];
}

export class RAGService {
  buildPrompt(query: string, retrievedChunks: SearchResult[]): RAGPromptResult {
    const citationsList: ICitation[] = retrievedChunks.map((chunk, index) => {
      const citationId = index + 1;
      return {
        id: citationId,
        documentId: chunk.payload.documentId,
        documentName: chunk.payload.filename,
        pageNumber: chunk.payload.pageNumber,
        snippet: chunk.payload.text.slice(0, 200).trim(),
        score: chunk.score
      };
    });

    const contextSections = retrievedChunks
      .map((chunk, index) => {
        const citationId = index + 1;
        const pageInfo = chunk.payload.pageNumber ? ` (Page ${chunk.payload.pageNumber})` : '';
        return `[${citationId}] Document: "${chunk.payload.filename}"${pageInfo}\n${chunk.payload.text}`;
      })
      .join('\n\n');

    const systemPrompt = `You are AskDesk, an expert customer support and technical AI assistant.
Answer the user's inquiry based strictly on the provided tenant documentation below.

CRITICAL INSTRUCTIONS:
1. Grounding & Anti-Hallucination: Answer ONLY using information stated directly in the provided context. If the context does not contain sufficient information to answer the question, state: "I do not have sufficient information in the provided documentation to answer this question."
2. Citations: Every factual claim must include a bracketed citation pointing to the source reference number, e.g. "You can reset your API key in settings [1]."
3. Tone: Direct, concise, technical, and helpful.

DOCUMENTATION CONTEXT:
${contextSections || 'No matching documentation found for this organization.'}`;

    return {
      systemPrompt,
      userPrompt: query,
      citationsList
    };
  }

  // Parse generated answer for bracketed numbers and return only the matching citations
  extractReferencedCitations(answer: string, availableCitations: ICitation[]): ICitation[] {
    const regex = /\[(\d+)\]/g;
    const referencedIds = new Set<number>();
    let match;

    while ((match = regex.exec(answer)) !== null) {
      const num = parseInt(match[1]!, 10);
      if (!isNaN(num)) {
        referencedIds.add(num);
      }
    }

    if (referencedIds.size === 0) {
      // If none explicitly cited but context was provided, return top citation
      return availableCitations.slice(0, 1);
    }

    return availableCitations.filter((c) => referencedIds.has(c.id));
  }
}

export const defaultRAGService = new RAGService();

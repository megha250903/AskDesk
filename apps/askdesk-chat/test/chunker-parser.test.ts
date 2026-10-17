import { describe, it, expect } from 'vitest';
import { defaultChunker, ChunkerService } from '../src/services/chunker.service.js';
import { defaultParser } from '../src/services/parser.service.js';

describe('Document Parsing & Recursive Chunking (Days 21 & 22)', () => {
  it('parses plain text buffer correctly', async () => {
    const raw = 'This is technical documentation for AskDesk API.';
    const buffer = Buffer.from(raw, 'utf-8');
    const result = await defaultParser.parseBuffer(buffer, 'text/plain');

    expect(result.text).toBe(raw);
    expect(result.pageCount).toBe(1);
  });

  it('handles empty or whitespace-only documents safely', () => {
    expect(defaultChunker.chunkText('')).toHaveLength(0);
    expect(defaultChunker.chunkText('   \n\n  \t  ')).toHaveLength(0);
  });

  it('preserves small documents as a single chunk without truncation', () => {
    const shortText = 'Short manual entry.';
    const chunks = defaultChunker.chunkText(shortText, 1);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe(shortText);
    expect(chunks[0]?.chunkIndex).toBe(0);
    expect(chunks[0]?.pageNumber).toBe(1);
    expect(chunks[0]?.charStart).toBe(0);
    expect(chunks[0]?.charEnd).toBe(shortText.length);
  });

  it('recursively splits long text with overlapping context window (Day 22)', () => {
    const customChunker = new ChunkerService({ chunkSize: 100, chunkOverlap: 20 });
    const paragraph1 =
      'Sentence one is providing context on how to configure organization webhooks.';
    const paragraph2 = 'Sentence two discusses rotating single-use refresh tokens for security.';
    const paragraph3 = 'Sentence three details rate limiting using Redis token bucket Lua scripts.';
    const fullText = `${paragraph1}\n\n${paragraph2}\n\n${paragraph3}`;

    const chunks = customChunker.chunkText(fullText);

    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]?.chunkIndex).toBe(i);
      expect(chunks[i]?.tokenCount).toBeGreaterThan(0);
    }

    // Verify overlap exists across adjacent chunks
    const chunk0 = chunks[0]!;
    const chunk1 = chunks[1]!;
    expect(chunk0.charEnd).toBeGreaterThan(chunk1.charStart);
  });
});

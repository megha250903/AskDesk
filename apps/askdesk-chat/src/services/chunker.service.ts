export interface Chunk {
  chunkIndex: number;
  text: string;
  pageNumber?: number | undefined;
  charStart: number;
  charEnd: number;
  tokenCount: number;
}

export interface ChunkerOptions {
  chunkSize?: number; // approx chars per chunk (default: 1500)
  chunkOverlap?: number; // overlap chars (default: 200)
  delimiters?: string[];
}

export class ChunkerService {
  private chunkSize: number;
  private chunkOverlap: number;
  private delimiters: string[];

  constructor(options: ChunkerOptions = {}) {
    this.chunkSize = options.chunkSize ?? 1500;
    this.chunkOverlap = options.chunkOverlap ?? 200;
    this.delimiters = options.delimiters ?? ['\n\n', '\n', '. ', '! ', '? ', '; ', ' ', ''];
  }

  chunkText(text: string, pageNumber?: number): Chunk[] {
    const trimmed = text.trim();
    if (!trimmed) return [];

    if (trimmed.length <= this.chunkSize) {
      return [
        {
          chunkIndex: 0,
          text: trimmed,
          pageNumber,
          charStart: 0,
          charEnd: trimmed.length,
          tokenCount: Math.ceil(trimmed.length / 4)
        }
      ];
    }

    const chunks: Chunk[] = [];
    let start = 0;
    let chunkIndex = 0;

    while (start < trimmed.length) {
      const end = start + this.chunkSize;

      if (end >= trimmed.length) {
        const slice = trimmed.slice(start).trim();
        if (slice.length > 0) {
          chunks.push({
            chunkIndex: chunkIndex++,
            text: slice,
            pageNumber,
            charStart: start,
            charEnd: trimmed.length,
            tokenCount: Math.ceil(slice.length / 4)
          });
        }
        break;
      }

      // Find best split point near 'end' using delimiters
      let splitPoint = -1;
      for (const delimiter of this.delimiters) {
        if (!delimiter) continue;
        const lastIndex = trimmed.lastIndexOf(delimiter, end);
        if (lastIndex > start + this.chunkOverlap) {
          splitPoint = lastIndex + delimiter.length;
          break;
        }
      }

      if (splitPoint === -1) {
        splitPoint = end;
      }

      const chunkText = trimmed.slice(start, splitPoint).trim();
      if (chunkText.length > 0) {
        chunks.push({
          chunkIndex: chunkIndex++,
          text: chunkText,
          pageNumber,
          charStart: start,
          charEnd: splitPoint,
          tokenCount: Math.ceil(chunkText.length / 4)
        });
      }

      // Move forward by chunk size minus overlap
      const nextStart = splitPoint - this.chunkOverlap;
      start = nextStart > start ? nextStart : splitPoint;
    }

    return chunks;
  }
}

export const defaultChunker = new ChunkerService();

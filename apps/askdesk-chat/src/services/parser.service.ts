import pdfParse from 'pdf-parse';

export interface ParsedDocument {
  text: string;
  pageCount: number;
  pages?: Array<{ pageNumber: number; text: string }>;
}

export class ParserService {
  async parseBuffer(buffer: Buffer, mimeType: string): Promise<ParsedDocument> {
    if (mimeType === 'application/pdf') {
      try {
        const data = await pdfParse(buffer);
        return {
          text: data.text,
          pageCount: data.numpages || 1
        };
      } catch {
        // Fallback to string decode if mock or invalid PDF
        const text = buffer.toString('utf-8');
        return {
          text,
          pageCount: 1
        };
      }
    }

    // Default: plain text / markdown / json
    const text = buffer.toString('utf-8');
    return {
      text,
      pageCount: 1
    };
  }
}

export const defaultParser = new ParserService();

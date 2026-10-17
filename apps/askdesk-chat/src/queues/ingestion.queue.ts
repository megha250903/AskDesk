import crypto from 'node:crypto';
import { DocumentModel } from '../models/document.model.js';
import { defaultParser } from '../services/parser.service.js';
import { defaultChunker } from '../services/chunker.service.js';
import { defaultEmbeddingClient } from '../services/embedding.client.js';
import { getQdrantClient, VectorPoint } from '../qdrant/qdrant.client.js';

export interface IngestionJobData {
  documentId: string;
  tenantId: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
  apiKey?: string;
}

export class IngestionWorker {
  private collectionName = 'askdesk_knowledge';

  async processDocument(data: IngestionJobData): Promise<{ chunkCount: number }> {
    const { documentId, tenantId, filename, mimeType, contentBase64, apiKey } = data;

    try {
      await DocumentModel.findByIdAndUpdate(documentId, { status: 'processing' });

      // 1. Parse document buffer
      const buffer = Buffer.from(contentBase64, 'base64');
      const parsed = await defaultParser.parseBuffer(buffer, mimeType);

      // 2. Chunk text recursively with overlap
      const chunks = defaultChunker.chunkText(parsed.text);
      if (chunks.length === 0) {
        await DocumentModel.findByIdAndUpdate(documentId, {
          status: 'indexed',
          chunkCount: 0
        });
        return { chunkCount: 0 };
      }

      // 3. Generate embeddings in batches of 32
      const BATCH_SIZE = 32;
      const qdrant = getQdrantClient();
      await qdrant.ensureCollection(this.collectionName, 1536);

      const allPoints: VectorPoint[] = [];

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const batchTexts = batch.map((c) => c.text);
        const { vectors } = await defaultEmbeddingClient.getEmbeddings(batchTexts, apiKey);

        batch.forEach((chunk, index) => {
          const vector = vectors[index] ?? new Array<number>(1536).fill(0);
          const pointId = crypto.randomUUID();

          allPoints.push({
            id: pointId,
            vector,
            payload: {
              tenantId,
              documentId,
              filename,
              pageNumber: chunk.pageNumber,
              chunkIndex: chunk.chunkIndex,
              text: chunk.text
            }
          });
        });
      }

      // 4. Bulk upsert into Qdrant collection with multi-tenant payload
      await qdrant.upsertPoints(this.collectionName, allPoints);

      // 5. Update MongoDB status to 'indexed'
      await DocumentModel.findByIdAndUpdate(documentId, {
        status: 'indexed',
        chunkCount: chunks.length,
        errorMessage: null
      });

      return { chunkCount: chunks.length };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown ingestion failure';
      await DocumentModel.findByIdAndUpdate(documentId, {
        status: 'failed',
        errorMessage: errorMsg
      });
      throw err;
    }
  }
}

export const defaultIngestionWorker = new IngestionWorker();

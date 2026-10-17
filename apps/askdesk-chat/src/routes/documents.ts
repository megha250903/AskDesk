import { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { DocumentModel, IDocument } from '../models/document.model.js';
import { defaultIngestionWorker } from '../queues/ingestion.queue.js';
import { getQdrantClient } from '../qdrant/qdrant.client.js';

export async function documentRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /orgs/:orgId/documents/upload
  fastify.post('/orgs/:orgId/documents/upload', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    if (!Types.ObjectId.isValid(orgId)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid organization ID'
      });
    }

    let filename = 'document.txt';
    let mimeType = 'text/plain';
    let contentBuffer: Buffer = Buffer.from('');

    // Check if multipart
    if (request.isMultipart()) {
      const part = await request.file();
      if (!part) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No file uploaded'
        });
      }
      filename = part.filename;
      mimeType = part.mimetype;
      contentBuffer = await part.toBuffer();
    } else {
      // JSON payload
      const body =
        (request.body as {
          filename?: string;
          mimeType?: string;
          content?: string;
        }) ?? {};

      if (!body.content) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Document content is required'
        });
      }

      filename = body.filename ?? 'document.txt';
      mimeType = body.mimeType ?? (filename.endsWith('.pdf') ? 'application/pdf' : 'text/plain');

      // Check if base64 encoded or raw text
      const isBase64 = /^[A-Za-z0-9+/=]+$/.test(body.content) && body.content.length % 4 === 0;
      contentBuffer = isBase64
        ? Buffer.from(body.content, 'base64')
        : Buffer.from(body.content, 'utf-8');
    }

    // 1. Create document in MongoDB
    const doc = new DocumentModel({
      organizationId: new Types.ObjectId(orgId),
      filename,
      fileSize: contentBuffer.length,
      mimeType,
      status: 'pending'
    });
    await doc.save();

    // 2. Process ingestion asynchronously
    const contentBase64 = contentBuffer.toString('base64');

    // Process indexing
    try {
      const result = await defaultIngestionWorker.processDocument({
        documentId: doc._id.toString(),
        tenantId: orgId,
        filename,
        mimeType,
        contentBase64
      });

      return reply.code(201).send({
        message: 'Document uploaded and indexed successfully',
        document: {
          id: doc._id.toString(),
          filename: doc.filename,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          status: 'indexed',
          chunkCount: result.chunkCount,
          createdAt: doc.createdAt
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ingestion failed';
      return reply.code(500).send({
        error: 'Ingestion Error',
        message: msg,
        documentId: doc._id.toString()
      });
    }
  });

  // GET /orgs/:orgId/documents
  fastify.get('/orgs/:orgId/documents', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    if (!Types.ObjectId.isValid(orgId)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid organization ID'
      });
    }

    const docs = await DocumentModel.find({
      organizationId: new Types.ObjectId(orgId)
    }).sort({ createdAt: -1 });

    return reply.code(200).send({
      documents: docs.map((d: IDocument) => ({
        id: d._id.toString(),
        filename: d.filename,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
        status: d.status,
        chunkCount: d.chunkCount,
        errorMessage: d.errorMessage,
        createdAt: d.createdAt
      }))
    });
  });

  // DELETE /orgs/:orgId/documents/:docId
  fastify.delete('/orgs/:orgId/documents/:docId', async (request, reply) => {
    const { orgId, docId } = request.params as { orgId: string; docId: string };

    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(docId)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid parameters'
      });
    }

    const doc = await DocumentModel.findOneAndDelete({
      _id: new Types.ObjectId(docId),
      organizationId: new Types.ObjectId(orgId)
    });

    if (!doc) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Document not found'
      });
    }

    // Delete vectors from Qdrant
    const qdrant = getQdrantClient();
    await qdrant.deleteByDocument('askdesk_knowledge', orgId, docId);

    return reply.code(200).send({
      message: 'Document and vectors deleted successfully',
      documentId: docId
    });
  });
}

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Types } from 'mongoose';
import crypto from 'node:crypto';
import { DocumentModel, IDocument } from '../models/document.model.js';
import { defaultIngestionWorker } from '../queues/ingestion.queue.js';
import { getQdrantClient } from '../qdrant/qdrant.client.js';

function toObjectId(id: string): Types.ObjectId {
  if (Types.ObjectId.isValid(id) && id.length === 24) {
    return new Types.ObjectId(id);
  }
  const hash = crypto.createHash('md5').update(id).digest('hex').substring(0, 24);
  return new Types.ObjectId(hash);
}

function parseContentBuffer(content: string, mimeType: string, encoding?: string): Buffer {
  if (encoding === 'base64') {
    return Buffer.from(content, 'base64');
  }
  if (content.startsWith('data:') && content.includes(';base64,')) {
    const base64Data = content.split(';base64,')[1] ?? '';
    return Buffer.from(base64Data, 'base64');
  }
  if (mimeType === 'application/pdf') {
    return Buffer.from(content, 'base64');
  }
  return Buffer.from(content, 'utf-8');
}

export async function documentRoutes(fastify: FastifyInstance): Promise<void> {
  const handleUpload = async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.params as { orgId: string };

    if (!orgId || orgId.trim() === '') {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Organization ID is required'
      });
    }

    const organizationObjectId = toObjectId(orgId);
    let filename = 'document.txt';
    let mimeType = 'text/plain';
    let contentBuffer: Buffer = Buffer.from('');

    // Check if multipart form upload
    if (request.isMultipart()) {
      const part = await request.file();
      if (!part) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No file uploaded'
        });
      }
      filename = part.filename;
      mimeType = part.mimetype || (filename.endsWith('.pdf') ? 'application/pdf' : 'text/plain');
      contentBuffer = await part.toBuffer();
    } else {
      // JSON payload
      const body =
        (request.body as {
          filename?: string;
          mimeType?: string;
          content?: string;
          encoding?: string;
        }) ?? {};

      if (!body.content) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Document content is required'
        });
      }

      filename = body.filename ?? 'document.txt';
      mimeType = body.mimeType ?? (filename.endsWith('.pdf') ? 'application/pdf' : 'text/plain');
      contentBuffer = parseContentBuffer(body.content, mimeType, body.encoding);
    }

    // 1. Create document in MongoDB
    const doc = new DocumentModel({
      organizationId: organizationObjectId,
      filename,
      fileSize: contentBuffer.length,
      mimeType,
      status: 'pending'
    });
    await doc.save();

    // 2. Process ingestion asynchronously
    const contentBase64 = contentBuffer.toString('base64');

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
          orgId: orgId,
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
  };

  // Support both POST /orgs/:orgId/documents and POST /orgs/:orgId/documents/upload
  fastify.post('/orgs/:orgId/documents', handleUpload);
  fastify.post('/orgs/:orgId/documents/upload', handleUpload);

  // GET /orgs/:orgId/documents
  fastify.get('/orgs/:orgId/documents', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    if (!orgId) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Organization ID is required'
      });
    }

    const organizationObjectId = toObjectId(orgId);

    const docs = await DocumentModel.find({
      organizationId: organizationObjectId
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

    if (!orgId || !docId) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid parameters'
      });
    }

    const organizationObjectId = toObjectId(orgId);

    const doc = await DocumentModel.findOneAndDelete({
      _id: toObjectId(docId),
      organizationId: organizationObjectId
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

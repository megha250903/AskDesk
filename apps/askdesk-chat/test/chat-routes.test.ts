import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { DocumentModel } from '../src/models/document.model.js';
import { ConversationModel } from '../src/models/conversation.model.js';
import { MessageModel } from '../src/models/message.model.js';

describe('Chat, Documents, Citations & Streaming Endpoints (Days 29, 30)', () => {
  let app: FastifyInstance;
  const testOrgId = new Types.ObjectId().toString();

  beforeAll(async () => {
    await mongoose.connect(env.MONGODB_URI);
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await DocumentModel.deleteMany({ organizationId: new Types.ObjectId(testOrgId) });
    await ConversationModel.deleteMany({ organizationId: new Types.ObjectId(testOrgId) });
    await MessageModel.deleteMany({ organizationId: new Types.ObjectId(testOrgId) });
    await app.close();
    await mongoose.disconnect();
  });

  it('GET /health returns service health information', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.status).toBe('ok');
    expect(json.service).toBe('askdesk-chat');
  });

  it('POST /orgs/:orgId/documents/upload stores and indexes text document', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/orgs/${testOrgId}/documents/upload`,
      payload: {
        filename: 'technical-support-policy.txt',
        content:
          'Customer support SLAs guarantee a 1-hour first response time for critical issues. Standard tickets have a 24-hour turnaround.'
      }
    });

    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.payload);
    expect(json.message).toContain('indexed successfully');
    expect(json.document.filename).toBe('technical-support-policy.txt');
    expect(json.document.chunkCount).toBeGreaterThan(0);
  });

  it('GET /orgs/:orgId/documents lists indexed documents', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/orgs/${testOrgId}/documents`
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.documents).toBeInstanceOf(Array);
    expect(json.documents.length).toBeGreaterThan(0);
    expect(json.documents[0].filename).toBe('technical-support-policy.txt');
  });

  it('POST /chat/completions answers grounded query with citations (Day 28)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/chat/completions',
      payload: {
        tenantId: testOrgId,
        message: 'What is the SLA turnaround for standard support tickets?'
      }
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.conversationId).toBeDefined();
    expect(json.role).toBe('assistant');
    expect(json.content).toBeDefined();
    expect(json.citations).toBeInstanceOf(Array);
    expect(json.handover.required).toBe(false);
  });

  it('POST /chat/completions flags human handover when user requests a human agent (Day 31)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/chat/completions',
      payload: {
        tenantId: testOrgId,
        message: 'I demand to speak to a real person right now!'
      }
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.status).toBe('needs_human_review');
    expect(json.handover.required).toBe(true);
    expect(json.handover.reason).toContain('User requested human agent escalation');
  });

  it('POST /chat/completions/stream streams citations and text chunks via SSE (Day 30)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/chat/completions/stream',
      payload: {
        tenantId: testOrgId,
        message: 'Explain support ticket response time.'
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.payload).toContain('event: citations');
    expect(res.payload).toContain('data: {"delta":');
    expect(res.payload).toContain('data: [DONE]');
  });

  it('GET /orgs/:orgId/conversations and GET /conversations/:id fetches history and messages (Day 29)', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: `/orgs/${testOrgId}/conversations`
    });

    expect(listRes.statusCode).toBe(200);
    const listJson = JSON.parse(listRes.payload);
    expect(listJson.conversations.length).toBeGreaterThan(0);

    const firstConvId = listJson.conversations[0].id;
    const detailRes = await app.inject({
      method: 'GET',
      url: `/orgs/${testOrgId}/conversations/${firstConvId}`
    });

    expect(detailRes.statusCode).toBe(200);
    const detailJson = JSON.parse(detailRes.payload);
    expect(detailJson.conversation.id).toBe(firstConvId);
    expect(detailJson.messages.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { DocumentModel } from '../src/models/document.model.js';
import { ConversationModel } from '../src/models/conversation.model.js';
import { MessageModel } from '../src/models/message.model.js';

describe('Day 41: End-to-End Multi-Service Orchestration & User Journey', () => {
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

  it('verifies security headers and W3C traceparent correlation on all responses', async () => {
    const customTrace = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': 'req-test-trace-123',
        traceparent: customTrace
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-request-id']).toBe('req-test-trace-123');
    expect(res.headers['traceparent']).toBe(customTrace);
  });

  it('executes full user journey: Ingest Knowledge -> RAG Completion -> Trace Session', async () => {
    // 1. Ingest Knowledge Document
    const uploadRes = await app.inject({
      method: 'POST',
      url: `/orgs/${testOrgId}/documents/upload`,
      payload: {
        filename: 'e2e-api-handbook.md',
        content:
          'AskDesk API keys start with ak_live_ or ak_test_. API keys must be passed in the Authorization header as Bearer ak_live_xyz. Rate limit tier for Pro accounts is 600 requests per minute.'
      }
    });

    expect(uploadRes.statusCode).toBe(201);
    const uploadJson = JSON.parse(uploadRes.payload);
    expect(uploadJson.document.status).toBe('indexed');
    expect(uploadJson.document.chunkCount).toBeGreaterThan(0);

    // 2. Query Chat Completion with Grounded RAG Search
    const chatRes = await app.inject({
      method: 'POST',
      url: '/chat/completions',
      payload: {
        tenantId: testOrgId,
        message: 'What is the rate limit tier for Pro accounts in AskDesk?'
      }
    });

    expect(chatRes.statusCode).toBe(200);
    const chatJson = JSON.parse(chatRes.payload);
    expect(chatJson.conversationId).toBeDefined();
    expect(chatJson.content).toBeDefined();
    expect(chatJson.citations).toBeInstanceOf(Array);
    expect(chatJson.citations.length).toBeGreaterThan(0);
    expect(chatJson.citations[0].documentName).toBe('e2e-api-handbook.md');

    // 3. Verify Session and Message Trace persisted in DB
    const convoRes = await app.inject({
      method: 'GET',
      url: `/orgs/${testOrgId}/conversations/${chatJson.conversationId}`
    });

    expect(convoRes.statusCode).toBe(200);
    const convoJson = JSON.parse(convoRes.payload);
    expect(convoJson.messages.length).toBe(2); // 1 user + 1 assistant
    expect(convoJson.messages[0].role).toBe('user');
    expect(convoJson.messages[1].role).toBe('assistant');
  });
});

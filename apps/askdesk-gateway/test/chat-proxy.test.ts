import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose, { Types } from 'mongoose';
import crypto from 'node:crypto';
import { buildGatewayApp } from '../src/app.js';
import { ApiKeyModel, OrganizationModel } from '../src/models/core-models.js';
import { closeRedisClient } from '../src/redis/client.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/askdesk_gateway_test';

describe('Gateway Chat Completions & Streaming (Days 11 & 12)', () => {
  let app: FastifyInstance;
  let testRawApiKey: string;
  let testOrgId: Types.ObjectId;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI);
    }
    app = buildGatewayApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await ApiKeyModel.deleteMany({});
    await OrganizationModel.deleteMany({});
    await closeRedisClient();
    await app.close();
  });

  beforeEach(async () => {
    await ApiKeyModel.deleteMany({});
    await OrganizationModel.deleteMany({});

    // Create test organization
    const org = new OrganizationModel({
      name: 'Proxy Test Corp',
      slug: `proxy-test-${Math.random().toString(36).substring(2, 7)}`,
      plan: 'pro'
    });
    await org.save();
    testOrgId = org._id as Types.ObjectId;

    // Create test API key
    testRawApiKey = 'ak_live_test1234567890abcdef1234567890';
    const keyHash = crypto.createHash('sha256').update(testRawApiKey).digest('hex');

    const apiKey = new ApiKeyModel({
      organizationId: testOrgId,
      name: 'Test Key',
      keyPrefix: 'ak_live_test1234',
      keyHash,
      isRevoked: false
    });
    await apiKey.save();
  });

  it('POST /v1/chat/completions executes non-streaming call and maps friendly model aliases (Day 11)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: { authorization: `Bearer ${testRawApiKey}` },
      payload: {
        model: 'fast', // Friendly alias for llama-3.1-8b-instant
        messages: [{ role: 'user', content: 'Hello gateway' }],
        stream: false
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);

    expect(body.object).toBe('chat.completion');
    expect(body.model).toBe('llama-3.1-8b-instant'); // Alias resolved!
    expect(body.choices).toBeDefined();
    expect(body.choices.length).toBeGreaterThan(0);
    expect(body.choices[0].message.role).toBe('assistant');
    expect(body.usage).toBeDefined();
    expect(body.usage.prompt_tokens).toBeGreaterThan(0);
  });

  it('POST /v1/chat/completions passes SSE stream in OpenAI chunk format ending with [DONE] (Day 12)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: { authorization: `Bearer ${testRawApiKey}` },
      payload: {
        model: 'smart', // Alias for llama-3.3-70b-versatile
        messages: [{ role: 'user', content: 'Stream this response' }],
        stream: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');

    const rawStream = response.payload;
    expect(rawStream).toContain('data: ');
    expect(rawStream).toContain('data: [DONE]');

    // Extract first data chunk
    const lines = rawStream
      .split('\n')
      .filter((l) => l.startsWith('data: ') && !l.includes('[DONE]'));
    expect(lines.length).toBeGreaterThan(0);

    const firstChunk = JSON.parse(lines[0]!.replace('data: ', ''));
    expect(firstChunk.object).toBe('chat.completion.chunk');
    expect(firstChunk.choices[0].delta).toBeDefined();
  });
});

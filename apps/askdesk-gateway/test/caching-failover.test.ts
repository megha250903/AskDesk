import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose, { Types } from 'mongoose';
import crypto from 'node:crypto';
import { buildGatewayApp } from '../src/app.js';
import { ApiKeyModel, OrganizationModel } from '../src/models/core-models.js';
import { UsageRecordModel } from '../src/models/usage-record.model.js';
import { getRedisClient, closeRedisClient } from '../src/redis/client.js';
import { ResilientRunner } from '../src/providers/resilient-runner.js';
import { IProvider, ChatCompletionRequest } from '../src/providers/provider.interface.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/askdesk_core_test';

describe('Caching, Failover & Telemetry (Days 15, 16, 17)', () => {
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
    await UsageRecordModel.deleteMany({});
    await closeRedisClient();
    await app.close();
  });

  beforeEach(async () => {
    await ApiKeyModel.deleteMany({});
    await OrganizationModel.deleteMany({});
    await UsageRecordModel.deleteMany({});

    const redis = getRedisClient();
    await redis.flushall();

    const org = new OrganizationModel({
      name: 'Resilience Org',
      slug: `resilience-org-${Math.random().toString(36).substring(2, 7)}`,
      plan: 'pro'
    });
    await org.save();
    testOrgId = org._id as Types.ObjectId;

    testRawApiKey = 'ak_live_resiliencekey1234567890abcdef';
    await new ApiKeyModel({
      organizationId: testOrgId,
      name: 'Resilience Key',
      keyPrefix: 'ak_live_resilience',
      keyHash: crypto.createHash('sha256').update(testRawApiKey).digest('hex'),
      isRevoked: false
    }).save();
  });

  // DAY 16: EXACT-MATCH RESPONSE CACHE
  describe('Day 16: Response Cache', () => {
    it('returns X-Cache: MISS on first call and X-Cache: HIT on identical request', async () => {
      const payload = {
        model: 'fast',
        messages: [{ role: 'user', content: 'What is 2 + 2?' }],
        temperature: 0.2 // Low temperature -> eligible for caching
      };

      // 1. First call: Cache MISS
      const firstRes = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: { authorization: `Bearer ${testRawApiKey}` },
        payload
      });

      expect(firstRes.statusCode).toBe(200);
      expect(firstRes.headers['x-cache']).toBe('MISS');

      // 2. Second call with exact identical payload: Cache HIT
      const secondRes = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: { authorization: `Bearer ${testRawApiKey}` },
        payload
      });

      expect(secondRes.statusCode).toBe(200);
      expect(secondRes.headers['x-cache']).toBe('HIT');
      expect(JSON.parse(secondRes.payload).choices[0].message.content).toBe(
        JSON.parse(firstRes.payload).choices[0].message.content
      );
    });

    it('skips cache for high-temperature requests (Day 16)', async () => {
      const highTempPayload = {
        model: 'fast',
        messages: [{ role: 'user', content: 'Write a creative poem' }],
        temperature: 1.0 // > 0.5 -> must skip cache
      };

      const res1 = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: { authorization: `Bearer ${testRawApiKey}` },
        payload: highTempPayload
      });
      expect(res1.headers['x-cache']).toBe('MISS');

      const res2 = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: { authorization: `Bearer ${testRawApiKey}` },
        payload: highTempPayload
      });
      expect(res2.headers['x-cache']).toBe('MISS'); // Still MISS!
    });
  });

  // DAY 17: FALLBACK AND RESILIENCE
  describe('Day 17: Fallback & Resilience', () => {
    it('automatically fails over to secondary provider when primary returns 500s', async () => {
      // Mock primary provider that always fails with 500
      const failingPrimary: IProvider = {
        name: 'groq-mock-failing',
        chatCompletion: async () => {
          throw new Error('500 Internal Server Error: Upstream service overloaded');
        },
        chatCompletionStream: async function* () {
          yield* [];
          throw new Error('500 Stream Error');
        }
      };

      // Secondary working provider
      const workingFallback: IProvider = {
        name: 'secondary-backup',
        chatCompletion: async (req: ChatCompletionRequest) => ({
          id: 'chatcmpl-fallback-test',
          object: 'chat.completion',
          created: 123456789,
          model: req.model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Saved by secondary provider!' },
              finish_reason: 'stop'
            }
          ],
          usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 }
        }),
        chatCompletionStream: async function* () {
          yield {
            id: 'c1',
            object: 'chat.completion.chunk',
            created: 123,
            model: 'fast',
            choices: [{ index: 0, delta: { content: 'chunk' }, finish_reason: 'stop' }]
          };
        }
      };

      const runner = new ResilientRunner(failingPrimary, workingFallback, { maxRetries: 1 });
      const result = await runner.executeChat({
        model: 'fast',
        messages: [{ role: 'user', content: 'Hello' }]
      });

      expect(result.providerUsed).toBe('secondary-backup');
      expect(result.response.choices[0]!.message.content).toBe('Saved by secondary provider!');
    });
  });

  // DAY 15: USAGE & COST TRACKING
  describe('Day 15: Usage and Cost Tracking', () => {
    it('persists telemetry and token cost calculations asynchronously to MongoDB', async () => {
      await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: { authorization: `Bearer ${testRawApiKey}` },
        payload: {
          model: 'fast',
          messages: [{ role: 'user', content: 'Record my token usage' }]
        }
      });

      // Allow setImmediate queue to flush to MongoDB
      await new Promise((r) => setTimeout(r, 100));

      const records = await UsageRecordModel.find({ organizationId: testOrgId });
      expect(records.length).toBeGreaterThan(0);

      const record = records[0];
      expect(record?.promptTokens).toBeGreaterThan(0);
      expect(record?.totalTokens).toBeGreaterThan(0);
      expect(typeof record?.costUsd).toBe('number');
      expect(typeof record?.latencyMs).toBe('number');
    });
  });
});

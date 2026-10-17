import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose, { Types } from 'mongoose';
import crypto from 'node:crypto';
import { buildGatewayApp } from '../src/app.js';
import { ApiKeyModel, OrganizationModel } from '../src/models/core-models.js';
import { UsageRecordModel } from '../src/models/usage-record.model.js';
import { getRedisClient, closeRedisClient } from '../src/redis/client.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/askdesk_core_test';

describe('Embeddings & Analytics API (Days 18 & 19)', () => {
  let app: FastifyInstance;
  let testRawApiKey: string;
  let testOrgId: Types.ObjectId;
  let testJwtToken: string;

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
      name: 'Analytics Org',
      slug: `analytics-org-${Math.random().toString(36).substring(2, 7)}`,
      plan: 'pro'
    });
    await org.save();
    testOrgId = org._id as Types.ObjectId;

    testRawApiKey = 'ak_live_analyticskey1234567890abcdef';
    await new ApiKeyModel({
      organizationId: testOrgId,
      name: 'Analytics Key',
      keyPrefix: 'ak_live_analytics',
      keyHash: crypto.createHash('sha256').update(testRawApiKey).digest('hex'),
      isRevoked: false
    }).save();

    // Sign JWT token for user analytics route
    testJwtToken = app.jwt.sign({ sub: 'user_analytics_123', email: 'admin@analytics.io' });
  });

  // DAY 18: EMBEDDINGS ENDPOINT
  describe('Day 18: Embeddings Endpoint', () => {
    it('POST /v1/embeddings generates OpenAI-compatible batch embeddings', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/embeddings',
        headers: { authorization: `Bearer ${testRawApiKey}` },
        payload: {
          model: 'text-embedding-3-small',
          input: ['Customer support document chunk 1', 'Returns and warranty policy chunk 2']
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      expect(body.object).toBe('list');
      expect(body.model).toBe('text-embedding-3-small');
      expect(body.data).toHaveLength(2);
      expect(body.data[0].object).toBe('embedding');
      expect(body.data[0].index).toBe(0);
      expect(body.data[0].embedding.length).toBe(384); // Vector dimensions
      expect(body.usage).toBeDefined();
      expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    });
  });

  // DAY 19: ANALYTICS API WITH MONGODB AGGREGATIONS
  describe('Day 19: Usage Analytics API', () => {
    it('GET /v1/analytics aggregates usage by day, model, cost, cache hit rate, and p50/p95 latency', async () => {
      // Seed realistic usage records
      await UsageRecordModel.create([
        {
          organizationId: testOrgId,
          model: 'llama-3.1-8b-instant',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costUsd: 0.0001,
          latencyMs: 120,
          cacheHit: false,
          createdAt: new Date()
        },
        {
          organizationId: testOrgId,
          model: 'llama-3.1-8b-instant',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          costUsd: 0.0001,
          latencyMs: 15,
          cacheHit: true,
          createdAt: new Date()
        },
        {
          organizationId: testOrgId,
          model: 'llama-3.3-70b-versatile',
          promptTokens: 500,
          completionTokens: 200,
          totalTokens: 700,
          costUsd: 0.0015,
          latencyMs: 450,
          cacheHit: false,
          createdAt: new Date()
        }
      ]);

      const res = await app.inject({
        method: 'GET',
        url: `/v1/analytics?orgId=${testOrgId.toString()}&days=7`,
        headers: { authorization: `Bearer ${testJwtToken}` }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);

      expect(body.organizationId).toBe(testOrgId.toString());
      expect(body.summary.totalRequests).toBe(3);
      expect(body.summary.totalTokens).toBe(1000);
      expect(body.summary.cacheHitRatePercent).toBeGreaterThan(0);
      expect(body.summary.latency.p50Ms).toBeGreaterThan(0);
      expect(body.summary.latency.p95Ms).toBeGreaterThanOrEqual(body.summary.latency.p50Ms);

      // Verify breakdowns
      expect(body.byDay.length).toBeGreaterThan(0);
      expect(body.byModel.length).toBe(2); // 8b and 70b
    });

    it('rejects unauthenticated requests to analytics with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/analytics?orgId=${testOrgId.toString()}`
      });

      expect(res.statusCode).toBe(401);
    });
  });
});

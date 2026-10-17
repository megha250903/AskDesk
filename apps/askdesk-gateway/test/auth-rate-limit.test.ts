import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import mongoose, { Types } from 'mongoose';
import crypto from 'node:crypto';
import { buildGatewayApp } from '../src/app.js';
import { ApiKeyModel, OrganizationModel } from '../src/models/core-models.js';
import { getRedisClient, closeRedisClient } from '../src/redis/client.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/askdesk_core_test';

describe('Gateway API Key Auth & Rate Limiting (Days 13 & 14)', () => {
  let app: FastifyInstance;
  let testRawApiKey: string;
  let freeRawApiKey: string;
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

    // Flush Redis mock
    const redis = getRedisClient();
    await redis.flushall();

    // 1. Pro Org
    const proOrg = new OrganizationModel({
      name: 'Pro Org',
      slug: `pro-org-${Math.random().toString(36).substring(2, 7)}`,
      plan: 'pro'
    });
    await proOrg.save();
    testOrgId = proOrg._id as Types.ObjectId;

    testRawApiKey = 'ak_live_validprokey1234567890abcdef';
    await new ApiKeyModel({
      organizationId: testOrgId,
      name: 'Pro Key',
      keyPrefix: 'ak_live_validpro',
      keyHash: crypto.createHash('sha256').update(testRawApiKey).digest('hex'),
      isRevoked: false
    }).save();

    // 2. Free Org (small bucket capacity for rate-limiting test)
    const freeOrg = new OrganizationModel({
      name: 'Free Org',
      slug: `free-org-${Math.random().toString(36).substring(2, 7)}`,
      plan: 'free'
    });
    await freeOrg.save();

    freeRawApiKey = 'ak_live_freeuserkey1234567890abcdef';
    await new ApiKeyModel({
      organizationId: freeOrg._id,
      name: 'Free Key',
      keyPrefix: 'ak_live_freeuser',
      keyHash: crypto.createHash('sha256').update(freeRawApiKey).digest('hex'),
      isRevoked: false
    }).save();
  });

  // DAY 13: API KEY AUTH
  describe('Day 13: API Key Authentication', () => {
    it('returns OpenAI-style 401 error format for missing API key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: { model: 'fast', messages: [{ role: 'user', content: 'Hi' }] }
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('missing_api_key');
      expect(body.error.type).toBe('invalid_request_error');
    });

    it('returns OpenAI-style 401 error format for invalid API key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: { authorization: 'Bearer ak_live_completely_wrong_key' },
        payload: { model: 'fast', messages: [{ role: 'user', content: 'Hi' }] }
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('invalid_api_key');
    });

    it('caches validated key in Redis for 60s (Day 13)', async () => {
      const redis = getRedisClient();
      const keyHash = crypto.createHash('sha256').update(testRawApiKey).digest('hex');

      // First call (populates Redis)
      await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: { authorization: `Bearer ${testRawApiKey}` },
        payload: { model: 'fast', messages: [{ role: 'user', content: 'Hi' }] }
      });

      // Verify cached in Redis
      const cached = await redis.get(`auth:key:${keyHash}`);
      expect(cached).not.toBeNull();
      const parsed = JSON.parse(cached!);
      expect(parsed.organizationId).toBe(testOrgId.toString());
      expect(parsed.plan).toBe('pro');
    });
  });

  // DAY 14: TOKEN BUCKET RATE LIMITING
  describe('Day 14: Token Bucket Rate Limiting (Redis Lua)', () => {
    it('returns 429 Too Many Requests with Retry-After when bucket is exhausted', async () => {
      // Free plan capacity is 20 tokens. We rapidly send 25 requests.
      const responses: number[] = [];

      for (let i = 0; i < 25; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          headers: { authorization: `Bearer ${freeRawApiKey}` },
          payload: { model: 'fast', messages: [{ role: 'user', content: 'Ping' }] }
        });
        responses.push(res.statusCode);
      }

      // At least some of the later requests must be 429
      const rateLimited = responses.filter((status) => status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);

      // Verify 429 headers and OpenAI error JSON
      const lastRes = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: { authorization: `Bearer ${freeRawApiKey}` },
        payload: { model: 'fast', messages: [{ role: 'user', content: 'Ping' }] }
      });

      expect(lastRes.statusCode).toBe(429);
      expect(lastRes.headers['retry-after']).toBeDefined();
      expect(lastRes.headers['x-ratelimit-limit']).toBeDefined();
      expect(lastRes.headers['x-ratelimit-remaining']).toBe('0');

      const body = JSON.parse(lastRes.payload);
      expect(body.error.code).toBe('rate_limit_exceeded');
    });

    it('concurrency test: sends parallel requests to test atomic Lua token bucket (Day 14)', async () => {
      const promises = Array.from({ length: 30 }, () =>
        app.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          headers: { authorization: `Bearer ${freeRawApiKey}` },
          payload: { model: 'fast', messages: [{ role: 'user', content: 'Parallel test' }] }
        })
      );

      const results = await Promise.all(promises);
      const statusCodes = results.map((r) => r.statusCode);

      // Verify that atomicity worked: exactly 20 succeeded (200) and 10 were rate-limited (429)
      const count200 = statusCodes.filter((s) => s === 200).length;
      const count429 = statusCodes.filter((s) => s === 429).length;

      expect(count200).toBe(20);
      expect(count429).toBe(10);
    });
  });
});

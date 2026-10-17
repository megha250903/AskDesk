import { FastifyRequest, FastifyReply } from 'fastify';
import { getRedisClient } from '../redis/client.js';

// Plan token bucket limits: { capacity, refillRatePerSec }
const PLAN_LIMITS: Record<
  'free' | 'pro' | 'enterprise',
  { capacity: number; refillRatePerSec: number }
> = {
  free: { capacity: 20, refillRatePerSec: 0.5 }, // 30 req/min
  pro: { capacity: 200, refillRatePerSec: 5.0 }, // 300 req/min
  enterprise: { capacity: 1000, refillRatePerSec: 50.0 } // 3000 req/min
};

/**
 * Atomic Token-Bucket Lua script for Redis.
 * Keys: 1 - rate-limit key
 * Args: capacity, refillRatePerSec, nowSeconds, requestedTokens
 * Returns: [allowed (0 or 1), remainingTokens, resetSeconds]
 */
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'lastUpdated')
local tokens = tonumber(data[1])
local lastUpdated = tonumber(data[2])

if not tokens then
  tokens = capacity
  lastUpdated = now
else
  local delta = math.max(0, now - lastUpdated)
  tokens = math.min(capacity, tokens + delta * refillRate)
  lastUpdated = now
end

local allowed = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'lastUpdated', lastUpdated)
redis.call('EXPIRE', key, 3600)

local resetSecs = math.ceil((capacity - tokens) / refillRate)
return { allowed, math.floor(tokens), resetSecs }
`;

export async function rateLimit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = request.gatewayAuth;
  if (!auth) return;

  const plan = auth.plan;
  const config = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  const redis = getRedisClient();
  const rateLimitKey = `ratelimit:key:${auth.apiKeyId}`;
  const now = Math.floor(Date.now() / 1000);

  try {
    let result: [number, number, number];

    // Check if redis supports eval (ioredis and ioredis-mock both support eval)
    if (typeof redis.eval === 'function') {
      const res = (await redis.eval(
        TOKEN_BUCKET_LUA,
        1,
        rateLimitKey,
        config.capacity.toString(),
        config.refillRatePerSec.toString(),
        now.toString(),
        '1'
      )) as [number, number, number];
      result = res;
    } else {
      // Fallback
      result = [1, config.capacity - 1, 1];
    }

    const [allowed, remaining, resetSecs] = result;

    // Attach headers
    reply.header('X-RateLimit-Limit', config.capacity.toString());
    reply.header('X-RateLimit-Remaining', Math.max(0, remaining).toString());
    reply.header('X-RateLimit-Reset', (now + resetSecs).toString());

    if (allowed === 0) {
      reply.header('Retry-After', Math.max(1, resetSecs).toString());
      return reply.code(429).send({
        error: {
          message: `Rate limit exceeded for plan '${plan}'. Please retry in ${resetSecs} seconds.`,
          type: 'requests',
          param: null,
          code: 'rate_limit_exceeded'
        }
      });
    }
  } catch (err) {
    request.log.error(err, 'Rate limit check encountered an error');
    // Fail open in case of Redis degradation
  }
}

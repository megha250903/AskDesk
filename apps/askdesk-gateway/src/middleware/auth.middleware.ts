import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { getRedisClient } from '../redis/client.js';
import { ApiKeyModel, OrganizationModel } from '../models/core-models.js';

export interface GatewayAuthContext {
  apiKeyId: string;
  organizationId: string;
  plan: 'free' | 'pro' | 'enterprise';
}

declare module 'fastify' {
  interface FastifyRequest {
    gatewayAuth?: GatewayAuthContext;
  }
}

export async function authenticateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({
      error: {
        message:
          "You didn't provide an API key. You need to provide your API key in an Authorization header using Bearer auth.",
        type: 'invalid_request_error',
        param: null,
        code: 'missing_api_key'
      }
    });
  }

  const rawKey = authHeader.replace('Bearer ', '').trim();
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const redis = getRedisClient();
  const cacheKey = `auth:key:${keyHash}`;

  // 1. Check 60-second Redis cache (Day 13 requirement)
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      request.gatewayAuth = JSON.parse(cached);
      return;
    }
  } catch {
    // If Redis read fails, fall through to MongoDB
  }

  // 2. Query MongoDB for hashed key
  const apiKeyDoc = await ApiKeyModel.findOne({ keyHash });

  if (!apiKeyDoc || apiKeyDoc.isRevoked) {
    return reply.code(401).send({
      error: {
        message: 'Incorrect API key provided or key has been revoked.',
        type: 'invalid_request_error',
        param: null,
        code: 'invalid_api_key'
      }
    });
  }

  // 3. Resolve organization & plan
  const orgDoc = await OrganizationModel.findById(apiKeyDoc.organizationId);
  const plan = orgDoc?.plan ?? 'free';

  const authContext: GatewayAuthContext = {
    apiKeyId: apiKeyDoc._id.toString(),
    organizationId: apiKeyDoc.organizationId.toString(),
    plan
  };

  // 4. Cache in Redis for 60 seconds (Day 13 requirement)
  try {
    await redis.set(cacheKey, JSON.stringify(authContext), 'EX', 60);
  } catch {
    // Non-fatal
  }

  request.gatewayAuth = authContext;
}

import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { getRedisClient } from '../redis/client.js';
import { ChatCompletionRequest, ChatCompletionResponse } from '../providers/provider.interface.js';

export function shouldCacheRequest(body: ChatCompletionRequest): boolean {
  // Day 16: "Skip streaming and high-temperature requests by default."
  if (body.stream === true) return false;
  if (body.temperature !== undefined && body.temperature > 0.5) return false;
  return true;
}

export function computeRequestHash(body: ChatCompletionRequest): string {
  const normalized = {
    model: body.model.toLowerCase().trim(),
    messages: body.messages.map((m) => ({ role: m.role, content: m.content.trim() }))
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export async function checkResponseCache(
  request: FastifyRequest<{ Body: ChatCompletionRequest }>,
  reply: FastifyReply
): Promise<ChatCompletionResponse | null> {
  if (!shouldCacheRequest(request.body)) {
    reply.header('X-Cache', 'MISS');
    return null;
  }

  const hash = computeRequestHash(request.body);
  const redis = getRedisClient();
  const cacheKey = `cache:response:${hash}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      reply.header('X-Cache', 'HIT');
      return JSON.parse(cached) as ChatCompletionResponse;
    }
  } catch {
    // Non-fatal cache failure
  }

  reply.header('X-Cache', 'MISS');
  return null;
}

export async function setResponseCache(
  body: ChatCompletionRequest,
  response: ChatCompletionResponse,
  ttlSeconds = 300
): Promise<void> {
  if (!shouldCacheRequest(body)) return;

  const hash = computeRequestHash(body);
  const redis = getRedisClient();
  const cacheKey = `cache:response:${hash}`;

  try {
    await redis.set(cacheKey, JSON.stringify(response), 'EX', ttlSeconds);
  } catch {
    // Non-fatal
  }
}

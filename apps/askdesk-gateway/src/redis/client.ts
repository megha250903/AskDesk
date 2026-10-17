import { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';
import { env } from '../config/env.js';

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (redisInstance) {
    return redisInstance;
  }

  if (env.REDIS_URL === 'embedded' || env.NODE_ENV === 'test') {
    // In-memory Redis simulation supporting all commands and Lua scripts
    redisInstance = new (RedisMock as unknown as typeof Redis)();
  } else {
    redisInstance = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });
  }

  return redisInstance;
}

export async function closeRedisClient(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit().catch(() => {});
    redisInstance = null;
  }
}

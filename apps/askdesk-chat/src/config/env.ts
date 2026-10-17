import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().default(4002),
  LOG_LEVEL: z.string().default('info'),
  GATEWAY_URL: z.string().url().default('http://127.0.0.1:4001'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/askdesk_core'),
  REDIS_URL: z.string().default('embedded'),
  QDRANT_URL: z.string().default('embedded'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .default('askdesk-super-secret-jwt-access-token-key-2026-min-32-chars')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration in askdesk-chat:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

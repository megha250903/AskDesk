import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load .env file from app root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/askdesk_core'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .default('askdesk-super-secret-jwt-access-token-key-2026-min-32-chars'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32)
    .default('askdesk-super-secret-jwt-refresh-token-key-2026-min-32-chars'),
  COOKIE_SECRET: z
    .string()
    .min(32)
    .default('askdesk-super-secret-cookie-signer-key-2026-min-32-chars'),
  STRIPE_SECRET_KEY: z.string().default('sk_test_askdesk_mock_key'),
  STRIPE_WEBHOOK_SECRET: z.string().default('whsec_askdesk_mock_key')
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnv(envInput: Record<string, string | undefined> = process.env): EnvConfig {
  const result = envSchema.safeParse(envInput);

  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    throw new Error(`[askdesk-core] Invalid environment configuration:\n${formattedErrors}`);
  }

  return result.data;
}

export const env = loadEnv();

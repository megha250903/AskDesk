import mongoose from 'mongoose';
import { buildApp } from './app.js';
import { env } from './config/env.js';

async function start(): Promise<void> {
  try {
    // 1. Connect to MongoDB
    await mongoose.connect(env.MONGODB_URI);
    console.log(`[askdesk-chat] Connected to MongoDB at ${env.MONGODB_URI}`);

    // 2. Build Fastify app
    const app = buildApp();

    // 3. Listen on PORT (4002)
    await app.listen({ host: env.HOST, port: env.PORT });
    console.log(
      `[askdesk-chat] Server running at http://${env.HOST}:${env.PORT} in ${env.NODE_ENV} mode`
    );

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`[askdesk-chat] Received ${signal}, closing server gracefully...`);
      await app.close();
      await mongoose.disconnect();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('[askdesk-chat] Fatal startup error:', err);
    process.exit(1);
  }
}

void start();

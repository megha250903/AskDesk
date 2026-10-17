import mongoose from 'mongoose';
import { buildGatewayApp } from './app.js';
import { env } from './config/env.js';
import { closeRedisClient } from './redis/client.js';

async function start(): Promise<void> {
  const app = buildGatewayApp();

  const closeSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of closeSignals) {
    process.on(signal, async () => {
      app.log.info({ signal }, 'Shutting down gateway gracefully...');
      try {
        await app.close();
        await closeRedisClient();
        await mongoose.disconnect();
        app.log.info('Gateway stopped successfully.');
        process.exit(0);
      } catch (err) {
        app.log.error(err, 'Error during gateway shutdown');
        process.exit(1);
      }
    });
  }

  try {
    // Connect to core MongoDB
    await mongoose.connect(env.MONGODB_URI);
    app.log.info(`[askdesk-gateway] Connected to MongoDB at ${env.MONGODB_URI}`);

    const address = await app.listen({
      port: env.PORT,
      host: env.HOST
    });
    app.log.info(`[askdesk-gateway] Running at ${address} in ${env.NODE_ENV} mode`);
  } catch (err) {
    app.log.fatal(err, '[askdesk-gateway] Failed to start gateway server');
    process.exit(1);
  }
}

void start();

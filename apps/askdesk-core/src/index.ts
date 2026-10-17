import { buildApp } from './app.js';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './db/connection.js';

async function start(): Promise<void> {
  const app = buildApp();

  // Graceful shutdown
  const closeSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of closeSignals) {
    process.on(signal, async () => {
      app.log.info({ signal }, 'Received termination signal, shutting down gracefully...');
      try {
        await app.close();
        await disconnectDb();
        app.log.info('Server and database successfully closed.');
        process.exit(0);
      } catch (err) {
        app.log.error(err, 'Error during shutdown');
        process.exit(1);
      }
    });
  }

  try {
    // Connect to database
    await connectDb(env.MONGODB_URI);
    app.log.info(`[askdesk-core] Connected to MongoDB at ${env.MONGODB_URI}`);

    const address = await app.listen({
      port: env.PORT,
      host: env.HOST
    });
    app.log.info(`[askdesk-core] Server running at ${address} in ${env.NODE_ENV} mode`);
  } catch (err) {
    app.log.fatal(err, '[askdesk-core] Failed to start server');
    process.exit(1);
  }
}

void start();

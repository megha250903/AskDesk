import fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { env } from './config/env.js';

export function buildApp(opts: FastifyServerOptions = {}): FastifyInstance {
  const defaultLogger: FastifyServerOptions['logger'] =
    env.NODE_ENV === 'test'
      ? false
      : {
          level: env.LOG_LEVEL
        };

  const app = fastify({
    logger: defaultLogger,
    ...opts
  });

  // Register routes
  app.register(healthRoutes);
  app.register(authRoutes);

  return app;
}

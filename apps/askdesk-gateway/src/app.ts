import fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { chatRoutes } from './routes/chat.js';
import { embeddingRoutes } from './routes/embeddings.js';
import { analyticsRoutes } from './routes/analytics.js';
import { env } from './config/env.js';

export function buildGatewayApp(opts: FastifyServerOptions = {}): FastifyInstance {
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

  // JWT plugin for analytics authorization
  app.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET
  });

  // Health route
  app.get('/health', async (_request, reply) => {
    return reply.code(200).send({
      status: 'ok',
      service: 'askdesk-gateway',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Register Gateway routes
  app.register(chatRoutes);
  app.register(embeddingRoutes);
  app.register(analyticsRoutes);

  return app;
}

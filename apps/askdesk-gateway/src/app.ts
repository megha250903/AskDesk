import fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { chatRoutes } from './routes/chat.js';
import { embeddingRoutes } from './routes/embeddings.js';
import { analyticsRoutes } from './routes/analytics.js';
import { env } from './config/env.js';

import crypto from 'node:crypto';

export function buildGatewayApp(opts: FastifyServerOptions = {}): FastifyInstance {
  const defaultLogger: FastifyServerOptions['logger'] =
    env.NODE_ENV === 'test'
      ? false
      : {
          level: env.LOG_LEVEL,
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'password',
            'secretKey',
            'apiKey',
            'token'
          ]
        };

  const app = fastify({
    logger: defaultLogger,
    bodyLimit: 2097152, // 2MB limit for gateway requests
    ...opts
  });

  // Security headers & Request correlation
  app.addHook('onRequest', async (request, reply) => {
    const rawReqId = request.headers['x-request-id'];
    const requestId = Array.isArray(rawReqId) ? rawReqId[0] : rawReqId || crypto.randomUUID();
    const rawTrace = request.headers['traceparent'];
    const traceparent = Array.isArray(rawTrace)
      ? rawTrace[0]
      : rawTrace ||
        `00-${crypto.randomUUID().replace(/-/g, '')}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}-01`;

    reply.header('x-request-id', requestId);
    reply.header('traceparent', traceparent);
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('x-xss-protection', '1; mode=block');
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

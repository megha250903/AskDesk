import fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import { healthRoutes } from './routes/health.js';
import { documentRoutes } from './routes/documents.js';
import { chatRoutes } from './routes/chat.js';
import { conversationRoutes } from './routes/conversations.js';
import { env } from './config/env.js';

import crypto from 'node:crypto';

export function buildApp(opts: FastifyServerOptions = {}): FastifyInstance {
  const defaultLogger: FastifyServerOptions['logger'] =
    env.NODE_ENV === 'test'
      ? false
      : {
          level: env.LOG_LEVEL,
          redact: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token']
        };

  const app = fastify({
    logger: defaultLogger,
    bodyLimit: 26214400, // 25MB limit for document uploads
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
    reply.header('x-frame-options', 'SAMEORIGIN');
    reply.header('x-xss-protection', '1; mode=block');
  });

  // CORS for widget and dashboard embedding
  app.register(fastifyCors, {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
  });

  // Multipart form support for document uploads
  app.register(fastifyMultipart, {
    limits: {
      fileSize: 25 * 1024 * 1024 // 25 MB max file upload
    }
  });

  // Register routes
  app.register(healthRoutes);
  app.register(documentRoutes);
  app.register(chatRoutes);
  app.register(conversationRoutes);

  return app;
}

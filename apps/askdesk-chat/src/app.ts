import fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import { healthRoutes } from './routes/health.js';
import { documentRoutes } from './routes/documents.js';
import { chatRoutes } from './routes/chat.js';
import { conversationRoutes } from './routes/conversations.js';
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

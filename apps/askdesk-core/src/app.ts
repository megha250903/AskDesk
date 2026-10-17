import fastify, {
  FastifyInstance,
  FastifyServerOptions,
  FastifyRequest,
  FastifyReply
} from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { orgRoutes } from './routes/orgs.js';
import { webhookRoutes } from './routes/webhooks.js';
import { env } from './config/env.js';

import crypto from 'node:crypto';

export function buildApp(opts: FastifyServerOptions = {}): FastifyInstance {
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
            'token'
          ]
        };

  const app = fastify({
    logger: defaultLogger,
    bodyLimit: 1048576, // 1MB limit for core requests
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

  // Cookie plugin
  app.register(fastifyCookie, {
    secret: env.COOKIE_SECRET,
    hook: 'onRequest'
  });

  // JWT plugin
  app.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET,
    sign: {
      expiresIn: '15m'
    }
  });

  // Rate Limiting (configured with generous limits for testing)
  app.register(fastifyRateLimit, {
    global: false,
    max: 100,
    timeWindow: '1 minute'
  });

  // Authentication decorator
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired access token'
      });
    }
  });

  // Register routes
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(orgRoutes);
  app.register(webhookRoutes);

  return app;
}

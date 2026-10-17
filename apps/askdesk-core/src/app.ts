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

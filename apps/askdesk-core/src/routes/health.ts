import { FastifyInstance, FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Healthcheck endpoint for monitoring service status and uptime',
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              uptime: { type: 'number' },
              timestamp: { type: 'string' }
            },
            required: ['status', 'service', 'uptime', 'timestamp']
          }
        }
      }
    },
    async (_request, reply) => {
      return reply.code(200).send({
        status: 'ok',
        service: 'askdesk-core',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    }
  );
};

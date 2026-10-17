import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { EmbeddingProvider } from '../providers/embedding.provider.js';
import { authenticateApiKey } from '../middleware/auth.middleware.js';
import { rateLimit } from '../middleware/rate-limit.middleware.js';
import { TelemetryQueue } from '../telemetry/queue.js';

const embeddingSchema = z.object({
  model: z.string().default('text-embedding-3-small'),
  input: z.union([z.string(), z.array(z.string())])
});

export const embeddingRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  const provider = new EmbeddingProvider();

  fastify.post(
    '/v1/embeddings',
    {
      preHandler: [authenticateApiKey, rateLimit]
    },
    async (request, reply) => {
      const validation = embeddingSchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          error: {
            message: 'Invalid request body',
            type: 'invalid_request_error',
            param: null,
            code: 'invalid_body',
            details: validation.error.errors
          }
        });
      }

      const startTime = Date.now();
      const auth = request.gatewayAuth!;

      try {
        const response = await provider.createEmbedding(validation.data);
        const latencyMs = Date.now() - startTime;

        // Telemetry
        void TelemetryQueue.push({
          organizationId: auth.organizationId,
          apiKeyId: auth.apiKeyId,
          model: response.model,
          promptTokens: response.usage.prompt_tokens,
          completionTokens: 0,
          latencyMs,
          cacheHit: false
        });

        return reply.code(200).send(response);
      } catch (err) {
        request.log.error(err, 'Failed to create embeddings');
        return reply.code(500).send({
          error: {
            message: `Embedding error: ${(err as Error).message}`,
            type: 'api_error',
            param: null,
            code: 'embedding_error'
          }
        });
      }
    }
  );
};

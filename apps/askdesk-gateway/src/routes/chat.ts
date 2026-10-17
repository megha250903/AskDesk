import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { GroqProvider } from '../providers/groq.provider.js';
import { FallbackProvider } from '../providers/fallback.provider.js';
import { ResilientRunner } from '../providers/resilient-runner.js';
import { authenticateApiKey } from '../middleware/auth.middleware.js';
import { rateLimit } from '../middleware/rate-limit.middleware.js';
import { checkResponseCache, setResponseCache } from '../middleware/cache.middleware.js';
import { TelemetryQueue } from '../telemetry/queue.js';
import { ChatCompletionRequest } from '../providers/provider.interface.js';
import { resolveModelName } from '../config/models.js';

const chatCompletionSchema = z.object({
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string()
      })
    )
    .min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional()
});

export const chatRoutes: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
  const primaryProvider = new GroqProvider();
  const fallbackProvider = new FallbackProvider();
  const runner = new ResilientRunner(primaryProvider, fallbackProvider);

  // POST /v1/chat/completions (Days 11, 12, 16, 17)
  fastify.post(
    '/v1/chat/completions',
    {
      preHandler: [authenticateApiKey, rateLimit]
    },
    async (request, reply) => {
      const validation = chatCompletionSchema.safeParse(request.body);
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

      const body = validation.data as ChatCompletionRequest;
      const startTime = Date.now();
      const auth = request.gatewayAuth!;
      const realModel = resolveModelName(body.model);

      // 1. Streaming Request (Day 12)
      if (body.stream === true) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no'
        });

        const abortController = new AbortController();

        // Handle client disconnect by aborting upstream (Day 12 requirement)
        request.raw.on('close', () => {
          if (!request.raw.complete) {
            abortController.abort();
          }
        });

        const promptTokensEst = body.messages.reduce(
          (sum, m) => sum + Math.ceil(m.content.length / 4),
          0
        );
        let completionTokensCount = 0;

        try {
          for await (const chunk of runner.executeChatStream(body, abortController.signal)) {
            completionTokensCount++;
            reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
          reply.raw.write('data: [DONE]\n\n');
        } catch (err) {
          request.log.error(err, 'Streaming error');
        } finally {
          reply.raw.end();
          const latencyMs = Date.now() - startTime;

          // Telemetry
          void TelemetryQueue.push({
            organizationId: auth.organizationId,
            apiKeyId: auth.apiKeyId,
            model: realModel,
            promptTokens: promptTokensEst,
            completionTokens: Math.max(1, completionTokensCount),
            latencyMs,
            cacheHit: false
          });
        }
        return reply;
      }

      // 2. Non-Streaming Request: Check Cache (Day 16)
      const cached = await checkResponseCache(request as never, reply);
      if (cached) {
        const latencyMs = Date.now() - startTime;
        void TelemetryQueue.push({
          organizationId: auth.organizationId,
          apiKeyId: auth.apiKeyId,
          model: realModel,
          promptTokens: cached.usage.prompt_tokens,
          completionTokens: cached.usage.completion_tokens,
          latencyMs,
          cacheHit: true
        });

        return reply.code(200).send(cached);
      }

      // 3. Execute with Provider & Automatic Fallback (Days 11 & 17)
      try {
        const { response } = await runner.executeChat(body);

        // Store in cache for subsequent hits
        await setResponseCache(body, response);

        const latencyMs = Date.now() - startTime;
        void TelemetryQueue.push({
          organizationId: auth.organizationId,
          apiKeyId: auth.apiKeyId,
          model: realModel,
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          latencyMs,
          cacheHit: false
        });

        return reply.code(200).send(response);
      } catch (err) {
        request.log.error(err, 'Failed to process chat completion');
        return reply.code(502).send({
          error: {
            message: `Gateway upstream error: ${(err as Error).message}`,
            type: 'api_error',
            param: null,
            code: 'upstream_error'
          }
        });
      }
    }
  );
};

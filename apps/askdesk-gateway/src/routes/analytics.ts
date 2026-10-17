import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { Types } from 'mongoose';
import { UsageRecordModel } from '../models/usage-record.model.js';

export const analyticsRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Protect with JWT
  const requireUserAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or missing user JWT token'
      });
    }
  };

  // GET /v1/analytics?orgId=...&days=30 (Day 19)
  fastify.get(
    '/v1/analytics',
    {
      preHandler: [requireUserAuth]
    },
    async (request, reply) => {
      const query = request.query as { orgId?: string; days?: string };
      const orgId = query.orgId;

      if (!orgId || !Types.ObjectId.isValid(orgId)) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Valid orgId query parameter is required'
        });
      }

      const days = Math.min(90, Math.max(1, parseInt(query.days ?? '30', 10)));
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const orgObjectId = new Types.ObjectId(orgId);

      // Aggregation Pipeline (Day 19 requirement)
      const [summary, byDay, byModel] = await Promise.all([
        // 1. Overall Summary
        UsageRecordModel.aggregate([
          { $match: { organizationId: orgObjectId, createdAt: { $gte: sinceDate } } },
          {
            $group: {
              _id: null,
              totalRequests: { $sum: 1 },
              totalPromptTokens: { $sum: '$promptTokens' },
              totalCompletionTokens: { $sum: '$completionTokens' },
              totalTokens: { $sum: '$totalTokens' },
              totalCostUsd: { $sum: '$costUsd' },
              cacheHits: {
                $sum: { $cond: [{ $eq: ['$cacheHit', true] }, 1, 0] }
              },
              latencies: { $push: '$latencyMs' }
            }
          }
        ]),

        // 2. Aggregated by Day
        UsageRecordModel.aggregate([
          { $match: { organizationId: orgObjectId, createdAt: { $gte: sinceDate } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              requests: { $sum: 1 },
              tokens: { $sum: '$totalTokens' },
              costUsd: { $sum: '$costUsd' }
            }
          },
          { $sort: { _id: 1 } }
        ]),

        // 3. Aggregated by Model
        UsageRecordModel.aggregate([
          { $match: { organizationId: orgObjectId, createdAt: { $gte: sinceDate } } },
          {
            $group: {
              _id: '$model',
              requests: { $sum: 1 },
              tokens: { $sum: '$totalTokens' },
              costUsd: { $sum: '$costUsd' }
            }
          },
          { $sort: { requests: -1 } }
        ])
      ]);

      const stat = summary[0] ?? {
        totalRequests: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        cacheHits: 0,
        latencies: []
      };

      // Calculate p50 and p95 latency
      const sortedLatencies = (stat.latencies as number[]).sort((a, b) => a - b);
      const count = sortedLatencies.length;
      const p50 = count > 0 ? (sortedLatencies[Math.floor(count * 0.5)] ?? 0) : 0;
      const p95 = count > 0 ? (sortedLatencies[Math.floor(count * 0.95)] ?? 0) : 0;

      const cacheHitRate =
        stat.totalRequests > 0 ? Math.round((stat.cacheHits / stat.totalRequests) * 1000) / 10 : 0;

      return reply.code(200).send({
        organizationId: orgId,
        periodDays: days,
        summary: {
          totalRequests: stat.totalRequests,
          totalPromptTokens: stat.totalPromptTokens,
          totalCompletionTokens: stat.totalCompletionTokens,
          totalTokens: stat.totalTokens,
          totalCostUsd: Math.round(stat.totalCostUsd * 1e6) / 1e6,
          cacheHitRatePercent: cacheHitRate,
          latency: {
            p50Ms: p50,
            p95Ms: p95
          }
        },
        byDay: byDay.map((d) => ({
          date: d._id,
          requests: d.requests,
          tokens: d.tokens,
          costUsd: Math.round(d.costUsd * 1e6) / 1e6
        })),
        byModel: byModel.map((m) => ({
          model: m._id,
          requests: m.requests,
          tokens: m.tokens,
          costUsd: Math.round(m.costUsd * 1e6) / 1e6
        }))
      });
    }
  );
};

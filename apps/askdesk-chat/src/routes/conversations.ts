import { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { ConversationModel, IConversation } from '../models/conversation.model.js';
import { MessageModel, IMessage } from '../models/message.model.js';

export async function conversationRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /orgs/:orgId/conversations
  fastify.get('/orgs/:orgId/conversations', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const query = (request.query as { status?: string; page?: string; limit?: string }) ?? {};

    if (!Types.ObjectId.isValid(orgId)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid organization ID'
      });
    }

    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(orgId)
    };

    if (query.status) {
      filter['status'] = query.status;
    }

    const [conversations, total] = await Promise.all([
      ConversationModel.find(filter).sort({ lastMessageAt: -1 }).skip(skip).limit(limit),
      ConversationModel.countDocuments(filter)
    ]);

    return reply.code(200).send({
      conversations: conversations.map((c: IConversation) => ({
        id: c._id.toString(),
        visitorId: c.visitorId,
        title: c.title,
        status: c.status,
        messageCount: c.messageCount,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt
      })),
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  });

  // GET /orgs/:orgId/conversations/:id
  fastify.get('/orgs/:orgId/conversations/:id', async (request, reply) => {
    const { orgId, id } = request.params as { orgId: string; id: string };

    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(id)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid parameters'
      });
    }

    const conversation = await ConversationModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(orgId)
    });

    if (!conversation) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Conversation not found'
      });
    }

    const messages = await MessageModel.find({
      conversationId: conversation._id
    }).sort({ createdAt: 1 });

    return reply.code(200).send({
      conversation: {
        id: conversation._id.toString(),
        visitorId: conversation.visitorId,
        title: conversation.title,
        status: conversation.status,
        messageCount: conversation.messageCount,
        lastMessageAt: conversation.lastMessageAt,
        createdAt: conversation.createdAt
      },
      messages: messages.map((m: IMessage) => ({
        id: m._id.toString(),
        role: m.role,
        content: m.content,
        citations: m.citations,
        tokens: m.tokens,
        latencyMs: m.latencyMs,
        createdAt: m.createdAt
      }))
    });
  });

  // PATCH /orgs/:orgId/conversations/:id (Resolve or update status)
  fastify.patch('/orgs/:orgId/conversations/:id', async (request, reply) => {
    const { orgId, id } = request.params as { orgId: string; id: string };
    const body = (request.body as { status?: 'active' | 'needs_human_review' | 'closed' }) ?? {};

    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(id)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid parameters'
      });
    }

    if (!body.status || !['active', 'needs_human_review', 'closed'].includes(body.status)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid status'
      });
    }

    const conversation = await ConversationModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(orgId)
      },
      { status: body.status },
      { new: true }
    );

    if (!conversation) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Conversation not found'
      });
    }

    return reply.code(200).send({
      message: 'Conversation status updated successfully',
      conversation: {
        id: conversation._id.toString(),
        status: conversation.status
      }
    });
  });
}

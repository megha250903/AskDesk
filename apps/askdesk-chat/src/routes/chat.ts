import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { ConversationModel } from '../models/conversation.model.js';
import { MessageModel } from '../models/message.model.js';
import { defaultHybridSearch } from '../services/hybrid-search.service.js';
import { defaultRAGService } from '../services/rag.service.js';
import { defaultHandoverService } from '../services/handover.service.js';
import { env } from '../config/env.js';

interface ChatRequestBody {
  tenantId: string;
  message?: string;
  messages?: Array<{ role: string; content: string }>;
  visitorId?: string;
  conversationId?: string;
  apiKey?: string;
}

export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /chat/completions (Non-streaming RAG)
  fastify.post('/chat/completions', async (request, reply) => {
    const body = (request.body as ChatRequestBody) ?? {};

    if (!body.tenantId) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'tenantId is required'
      });
    }

    const userMessageContent =
      body.message ??
      body.messages?.find((m) => m.role === 'user')?.content ??
      body.messages?.[body.messages.length - 1]?.content;

    if (!userMessageContent) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Message content is required'
      });
    }

    const tenantObjectId = Types.ObjectId.isValid(body.tenantId)
      ? new Types.ObjectId(body.tenantId)
      : new Types.ObjectId();

    // 1. Resolve or create Conversation
    let conversation;
    if (body.conversationId && Types.ObjectId.isValid(body.conversationId)) {
      conversation = await ConversationModel.findById(body.conversationId);
    }

    if (!conversation) {
      conversation = new ConversationModel({
        organizationId: tenantObjectId,
        visitorId: body.visitorId ?? `visitor_${crypto.randomUUID().substring(0, 8)}`,
        title: userMessageContent.slice(0, 40) + '...',
        status: 'active'
      });
      await conversation.save();
    }

    // 2. Persist User Message
    const userMsg = new MessageModel({
      conversationId: conversation._id,
      organizationId: tenantObjectId,
      role: 'user',
      content: userMessageContent,
      citations: []
    });
    await userMsg.save();

    // 3. Hybrid Search in Qdrant with strict tenant isolation
    const retrievedChunks = await defaultHybridSearch.search(
      body.tenantId,
      userMessageContent,
      5,
      body.apiKey
    );

    // 4. Human Handover Check (Day 31)
    const handover = defaultHandoverService.evaluate(userMessageContent, retrievedChunks);
    if (handover.shouldHandover) {
      conversation.status = 'needs_human_review';
    }

    // 5. Build RAG Prompt
    const { systemPrompt, userPrompt, citationsList } = defaultRAGService.buildPrompt(
      userMessageContent,
      retrievedChunks
    );

    // 6. Generate Response (via Gateway or Grounded Engine)
    let answerText = '';
    const startTime = Date.now();

    try {
      if (body.apiKey && env.NODE_ENV !== 'test') {
        const gwRes = await fetch(`${env.GATEWAY_URL}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${body.apiKey}`
          },
          body: JSON.stringify({
            model: 'fast',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.2
          })
        });

        if (gwRes.ok) {
          const gwJson = (await gwRes.json()) as {
            choices: Array<{ message: { content: string } }>;
          };
          answerText = gwJson.choices[0]?.message.content ?? '';
        }
      }
    } catch {
      // Fall through to grounded fallback
    }

    // If answer not obtained from gateway, generate deterministic grounded answer
    if (!answerText) {
      if (retrievedChunks.length > 0) {
        const topChunk = retrievedChunks[0]!;
        answerText = `Based on the documentation in "${topChunk.payload.filename}", here is the answer: ${topChunk.payload.text.slice(0, 220)}... [1]`;
      } else {
        answerText =
          'I do not have sufficient information in the provided documentation to answer this question. A human agent has been notified to assist you.';
      }
    }

    const latencyMs = Date.now() - startTime;

    // 7. Extract Referenced Citations (Day 28)
    const activeCitations = defaultRAGService.extractReferencedCitations(answerText, citationsList);

    // 8. Persist Assistant Message
    const assistantMsg = new MessageModel({
      conversationId: conversation._id,
      organizationId: tenantObjectId,
      role: 'assistant',
      content: answerText,
      citations: activeCitations,
      tokens: Math.ceil((systemPrompt.length + userPrompt.length + answerText.length) / 4),
      latencyMs
    });
    await assistantMsg.save();

    // Update conversation message count
    conversation.messageCount += 2;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    return reply.code(200).send({
      conversationId: conversation._id.toString(),
      messageId: assistantMsg._id.toString(),
      role: 'assistant',
      content: answerText,
      citations: activeCitations,
      status: conversation.status,
      handover: handover.shouldHandover
        ? {
            required: true,
            reason: handover.reason,
            confidenceScore: handover.confidenceScore
          }
        : { required: false }
    });
  });

  // POST /chat/completions/stream (Server-Sent Events streaming - Day 30)
  fastify.post('/chat/completions/stream', async (request, reply) => {
    const body = (request.body as ChatRequestBody) ?? {};

    if (!body.tenantId) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'tenantId is required'
      });
    }

    const userMessageContent =
      body.message ??
      body.messages?.find((m) => m.role === 'user')?.content ??
      body.messages?.[body.messages.length - 1]?.content;

    if (!userMessageContent) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Message content is required'
      });
    }

    const tenantObjectId = Types.ObjectId.isValid(body.tenantId)
      ? new Types.ObjectId(body.tenantId)
      : new Types.ObjectId();

    // 1. Resolve or create Conversation
    let conversation = body.conversationId
      ? await ConversationModel.findById(body.conversationId)
      : null;

    if (!conversation) {
      conversation = new ConversationModel({
        organizationId: tenantObjectId,
        visitorId: body.visitorId ?? `visitor_${crypto.randomUUID().substring(0, 8)}`,
        title: userMessageContent.slice(0, 40) + '...',
        status: 'active'
      });
      await conversation.save();
    }

    // 2. Hybrid Search in Qdrant
    const retrievedChunks = await defaultHybridSearch.search(
      body.tenantId,
      userMessageContent,
      5,
      body.apiKey
    );

    // 3. Handover check
    const handover = defaultHandoverService.evaluate(userMessageContent, retrievedChunks);
    if (handover.shouldHandover) {
      conversation.status = 'needs_human_review';
      await conversation.save();
    }

    // 4. Build RAG prompt & citations
    const { citationsList } = defaultRAGService.buildPrompt(userMessageContent, retrievedChunks);

    // 5. Setup SSE Stream headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();

    // 6. Send initial citations event immediately
    reply.raw.write(
      `event: citations\ndata: ${JSON.stringify({
        conversationId: conversation._id.toString(),
        citations: citationsList,
        handover: handover.shouldHandover
      })}\n\n`
    );

    // 7. Stream token deltas
    let answerText = '';
    if (retrievedChunks.length > 0) {
      const top = retrievedChunks[0]!;
      answerText = `Based on "${top.payload.filename}": ${top.payload.text.slice(0, 200)}... [1]`;
    } else {
      answerText =
        'I do not have sufficient information in the provided documentation to answer this question. A human agent has been alerted.';
    }

    const words = answerText.split(' ');
    for (let i = 0; i < words.length; i++) {
      const word = (i === 0 ? '' : ' ') + words[i];
      reply.raw.write(`data: ${JSON.stringify({ delta: word })}\n\n`);
    }

    // 8. Send DONE marker
    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();

    // 9. Persist message history in background
    const activeCitations = defaultRAGService.extractReferencedCitations(answerText, citationsList);
    void MessageModel.create({
      conversationId: conversation._id,
      organizationId: tenantObjectId,
      role: 'assistant',
      content: answerText,
      citations: activeCitations
    });
  });
}

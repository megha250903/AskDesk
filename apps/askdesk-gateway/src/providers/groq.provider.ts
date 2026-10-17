import Groq from 'groq-sdk';
import {
  IProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk
} from './provider.interface.js';
import { resolveModelName } from '../config/models.js';
import { env } from '../config/env.js';

export class GroqProvider implements IProvider {
  name = 'groq';
  private groq: Groq;

  constructor(apiKey?: string) {
    this.groq = new Groq({
      apiKey: apiKey ?? env.GROQ_API_KEY
    });
  }

  async chatCompletion(
    request: ChatCompletionRequest,
    signal?: AbortSignal
  ): Promise<ChatCompletionResponse> {
    const realModel = resolveModelName(request.model);

    // If mock key or test mode without real network call
    if (env.GROQ_API_KEY.includes('mock') && env.NODE_ENV === 'test') {
      return {
        id: `chatcmpl-mock-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: realModel,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Mock response from Groq Provider'
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 8,
          total_tokens: 23
        }
      };
    }

    const response = await this.groq.chat.completions.create(
      {
        model: realModel,
        messages: request.messages as Groq.Chat.Completions.ChatCompletionMessageParam[],
        temperature: request.temperature ?? 0.7,
        ...(request.max_tokens !== undefined ? { max_tokens: request.max_tokens } : {}),
        stream: false
      },
      { signal }
    );

    return {
      id: response.id,
      object: 'chat.completion',
      created: response.created,
      model: response.model,
      choices: response.choices.map((c) => ({
        index: c.index,
        message: {
          role: 'assistant',
          content: c.message.content ?? ''
        },
        finish_reason: c.finish_reason ?? 'stop'
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens ?? 0,
        completion_tokens: response.usage?.completion_tokens ?? 0,
        total_tokens: response.usage?.total_tokens ?? 0
      }
    };
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest,
    signal?: AbortSignal
  ): AsyncIterable<ChatCompletionChunk> {
    const realModel = resolveModelName(request.model);

    if (env.GROQ_API_KEY.includes('mock') && env.NODE_ENV === 'test') {
      const words = ['Mock', ' streaming', ' from', ' Groq', ' provider'];
      for (let i = 0; i < words.length; i++) {
        if (signal?.aborted) return;
        yield {
          id: `chatcmpl-mock-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: realModel,
          choices: [
            {
              index: 0,
              delta: { content: words[i] ?? null },
              finish_reason: i === words.length - 1 ? 'stop' : null
            }
          ]
        };
      }
      return;
    }

    const stream = await this.groq.chat.completions.create(
      {
        model: realModel,
        messages: request.messages as Groq.Chat.Completions.ChatCompletionMessageParam[],
        temperature: request.temperature ?? 0.7,
        ...(request.max_tokens !== undefined ? { max_tokens: request.max_tokens } : {}),
        stream: true
      },
      { signal }
    );

    for await (const chunk of stream) {
      if (signal?.aborted) {
        break;
      }

      yield {
        id: chunk.id,
        object: 'chat.completion.chunk',
        created: chunk.created,
        model: chunk.model,
        choices: chunk.choices.map((c) => ({
          index: c.index,
          delta: {
            role: c.delta.role ?? null,
            content: c.delta.content ?? null
          },
          finish_reason: c.finish_reason ?? null
        }))
      };
    }
  }
}

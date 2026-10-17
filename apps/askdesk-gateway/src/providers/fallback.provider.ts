import {
  IProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk
} from './provider.interface.js';
import { resolveModelName } from '../config/models.js';

export class FallbackProvider implements IProvider {
  name = 'fallback-backup';

  async chatCompletion(
    request: ChatCompletionRequest,
    _signal?: AbortSignal
  ): Promise<ChatCompletionResponse> {
    const model = resolveModelName(request.model);
    return {
      id: `chatcmpl-fallback-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Response served by secondary fallback provider due to upstream timeout'
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 14,
        total_tokens: 26
      }
    };
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest,
    signal?: AbortSignal
  ): AsyncIterable<ChatCompletionChunk> {
    const model = resolveModelName(request.model);
    const tokens = ['Response ', 'served ', 'by ', 'fallback ', 'provider'];

    for (let i = 0; i < tokens.length; i++) {
      if (signal?.aborted) return;
      yield {
        id: `chatcmpl-chunk-fb-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: { content: tokens[i] ?? null },
            finish_reason: i === tokens.length - 1 ? 'stop' : null
          }
        ]
      };
    }
  }
}

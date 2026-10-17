import {
  IProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk
} from './provider.interface.js';

export class ResilientRunner {
  private primary: IProvider;
  private fallback: IProvider;
  private maxRetries: number;
  private timeoutMs: number;

  constructor(
    primary: IProvider,
    fallback: IProvider,
    options: { maxRetries?: number; timeoutMs?: number } = {}
  ) {
    this.primary = primary;
    this.fallback = fallback;
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  async executeChat(
    request: ChatCompletionRequest,
    clientSignal?: AbortSignal
  ): Promise<{ response: ChatCompletionResponse; providerUsed: string }> {
    let lastError: Error | null = null;

    // 1. Try primary provider with retries
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (clientSignal?.aborted) {
        throw new Error('Client aborted request');
      }

      try {
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), this.timeoutMs);

        const mergedSignal = clientSignal ?? timeoutController.signal;

        const res = await this.primary.chatCompletion(request, mergedSignal);
        clearTimeout(timeoutId);
        return { response: res, providerUsed: this.primary.name };
      } catch (err) {
        lastError = err as Error;
        // Exponential backoff with jitter
        if (attempt < this.maxRetries) {
          const delay = Math.min(1000, 100 * Math.pow(2, attempt)) + Math.random() * 50;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // 2. Primary failed, trigger Day 17 fallback!
    try {
      const fallbackRes = await this.fallback.chatCompletion(request, clientSignal);
      return { response: fallbackRes, providerUsed: this.fallback.name };
    } catch (fallbackErr) {
      throw new Error(
        `All providers failed. Primary error: ${lastError?.message}. Fallback error: ${(fallbackErr as Error).message}`
      );
    }
  }

  async *executeChatStream(
    request: ChatCompletionRequest,
    clientSignal?: AbortSignal
  ): AsyncIterable<ChatCompletionChunk & { providerUsed?: string }> {
    try {
      for await (const chunk of this.primary.chatCompletionStream(request, clientSignal)) {
        yield { ...chunk, providerUsed: this.primary.name };
      }
    } catch {
      // Primary stream failed, failover to fallback stream!
      for await (const chunk of this.fallback.chatCompletionStream(request, clientSignal)) {
        yield { ...chunk, providerUsed: this.fallback.name };
      }
    }
  }
}

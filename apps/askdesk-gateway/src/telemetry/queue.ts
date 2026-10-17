import { Types } from 'mongoose';
import { UsageRecordModel } from '../models/usage-record.model.js';
import { calculateCostUsd } from '../config/pricing.js';

export interface TelemetryEvent {
  organizationId: string;
  apiKeyId?: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  cacheHit: boolean;
}

export class TelemetryQueue {
  /**
   * Dispatches a usage event asynchronously without blocking the client response.
   */
  static async push(event: TelemetryEvent): Promise<void> {
    setImmediate(async () => {
      try {
        const totalTokens = event.promptTokens + event.completionTokens;
        const costUsd = calculateCostUsd(event.model, event.promptTokens, event.completionTokens);

        const record = new UsageRecordModel({
          organizationId: new Types.ObjectId(event.organizationId),
          apiKeyId: event.apiKeyId ? new Types.ObjectId(event.apiKeyId) : null,
          model: event.model,
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          totalTokens,
          costUsd,
          latencyMs: event.latencyMs,
          cacheHit: event.cacheHit
        });

        await record.save();
      } catch (err) {
        console.error('[TelemetryQueue] Failed to record usage:', err);
      }
    });
  }
}

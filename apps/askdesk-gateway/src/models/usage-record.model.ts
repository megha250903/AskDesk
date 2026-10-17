import { Schema, model, Model, Types } from 'mongoose';

export interface IUsageRecord {
  organizationId: Types.ObjectId;
  apiKeyId?: Types.ObjectId | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
  cacheHit: boolean;
  createdAt: Date;
}

const usageRecordSchema = new Schema<IUsageRecord>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true
    },
    apiKeyId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true
    },
    model: {
      type: String,
      required: true,
      index: true
    },
    promptTokens: {
      type: Number,
      required: true,
      default: 0
    },
    completionTokens: {
      type: Number,
      required: true,
      default: 0
    },
    totalTokens: {
      type: Number,
      required: true,
      default: 0
    },
    costUsd: {
      type: Number,
      required: true,
      default: 0
    },
    latencyMs: {
      type: Number,
      required: true,
      default: 0
    },
    cacheHit: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

// Compound index for fast time-series analytics pipelines (Day 19)
usageRecordSchema.index({ organizationId: 1, createdAt: -1 });
usageRecordSchema.index({ organizationId: 1, model: 1, createdAt: -1 });

export const UsageRecordModel: Model<IUsageRecord> = model<IUsageRecord>(
  'UsageRecord',
  usageRecordSchema
);

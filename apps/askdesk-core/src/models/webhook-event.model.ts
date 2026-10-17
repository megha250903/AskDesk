import { Schema, model, Document, Model } from 'mongoose';

export interface IWebhookEvent extends Document {
  eventId: string;
  source: string;
  processedAt: Date;
}

const webhookEventSchema = new Schema<IWebhookEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    source: {
      type: String,
      required: true,
      default: 'stripe'
    },
    processedAt: {
      type: Date,
      default: Date.now,
      index: { expires: '90d' } // Expire processed event history after 90 days
    }
  },
  {
    timestamps: true
  }
);

export const WebhookEventModel: Model<IWebhookEvent> = model<IWebhookEvent>(
  'WebhookEvent',
  webhookEventSchema
);

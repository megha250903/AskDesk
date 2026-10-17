import mongoose, { Document, Schema, Types } from 'mongoose';

export type ConversationStatus = 'active' | 'needs_human_review' | 'closed';

export interface IConversation extends Document {
  organizationId: Types.ObjectId;
  visitorId: string;
  title: string;
  status: ConversationStatus;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    visitorId: { type: String, required: true, index: true },
    title: { type: String, default: 'New Support Conversation' },
    status: {
      type: String,
      enum: ['active', 'needs_human_review', 'closed'],
      default: 'active',
      index: true
    },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
);

conversationSchema.index({ organizationId: 1, lastMessageAt: -1 });

export const ConversationModel: mongoose.Model<IConversation> =
  (mongoose.models.Conversation as mongoose.Model<IConversation>) ||
  mongoose.model<IConversation>('Conversation', conversationSchema);

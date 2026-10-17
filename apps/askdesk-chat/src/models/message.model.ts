import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICitation {
  id: number;
  documentId: string;
  documentName: string;
  pageNumber?: number | undefined;
  snippet: string;
  score: number;
}

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  organizationId: Types.ObjectId;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: ICitation[];
  tokens?: number;
  latencyMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

const citationSchema = new Schema<ICitation>(
  {
    id: { type: Number, required: true },
    documentId: { type: String, required: true },
    documentName: { type: String, required: true },
    pageNumber: { type: Number, required: false },
    snippet: { type: String, required: true },
    score: { type: Number, required: true }
  },
  { _id: false }
);

const messageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    citations: { type: [citationSchema], default: [] },
    tokens: { type: Number, required: false },
    latencyMs: { type: Number, required: false }
  },
  {
    timestamps: true
  }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });

export const MessageModel: mongoose.Model<IMessage> =
  (mongoose.models.ChatMessage as mongoose.Model<IMessage>) ||
  mongoose.model<IMessage>('ChatMessage', messageSchema);

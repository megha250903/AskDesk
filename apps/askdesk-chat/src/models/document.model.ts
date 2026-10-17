import mongoose, { Document, Schema, Types } from 'mongoose';

export type DocumentStatus = 'pending' | 'processing' | 'indexed' | 'failed';

export interface IDocument extends Document {
  organizationId: Types.ObjectId;
  filename: string;
  fileSize: number;
  mimeType: string;
  status: DocumentStatus;
  chunkCount: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IDocument>(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    filename: { type: String, required: true, trim: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'indexed', 'failed'],
      default: 'pending',
      index: true
    },
    chunkCount: { type: Number, default: 0 },
    errorMessage: { type: String, required: false }
  },
  {
    timestamps: true
  }
);

documentSchema.index({ organizationId: 1, createdAt: -1 });

export const DocumentModel: mongoose.Model<IDocument> =
  (mongoose.models.ChatDocument as mongoose.Model<IDocument>) ||
  mongoose.model<IDocument>('ChatDocument', documentSchema);

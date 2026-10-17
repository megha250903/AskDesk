import { Schema, model, Document, Model, Types } from 'mongoose';

export interface IApiKey extends Document {
  organizationId: Types.ObjectId;
  name: string;
  keyPrefix: string;
  keyHash: string;
  createdBy: Types.ObjectId;
  isRevoked: boolean;
  lastUsedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const apiKeySchema = new Schema<IApiKey>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    keyPrefix: {
      type: String,
      required: true,
      index: true
    },
    keyHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true
    },
    lastUsedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export const ApiKeyModel: Model<IApiKey> = model<IApiKey>('ApiKey', apiKeySchema);

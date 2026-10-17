import { Schema, model, Document, Model, Types } from 'mongoose';

export interface IApiKeyDoc extends Document {
  organizationId: Types.ObjectId;
  name: string;
  keyPrefix: string;
  keyHash: string;
  isRevoked: boolean;
  lastUsedAt?: Date | null;
}

const apiKeySchema = new Schema<IApiKeyDoc>(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true },
    keyPrefix: { type: String, required: true, index: true },
    keyHash: { type: String, required: true, unique: true, index: true },
    isRevoked: { type: Boolean, default: false, index: true },
    lastUsedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const ApiKeyModel: Model<IApiKeyDoc> =
  model.prototype && 'ApiKey' in (model as unknown as Record<string, unknown>)
    ? model<IApiKeyDoc>('ApiKey')
    : model<IApiKeyDoc>('ApiKey', apiKeySchema);

export interface IOrgDoc extends Document {
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
}

const orgSchema = new Schema<IOrgDoc>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' }
  },
  { timestamps: true }
);

export const OrganizationModel: Model<IOrgDoc> =
  model.prototype && 'Organization' in (model as unknown as Record<string, unknown>)
    ? model<IOrgDoc>('Organization')
    : model<IOrgDoc>('Organization', orgSchema);

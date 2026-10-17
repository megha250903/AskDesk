import { Schema, model, Document, Model } from 'mongoose';

export interface IOrganization extends Document {
  name: string;
  slug: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    stripeCustomerId: {
      type: String,
      default: null,
      index: true
    },
    stripeSubscriptionId: {
      type: String,
      default: null
    },
    plan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free',
      index: true
    }
  },
  {
    timestamps: true
  }
);

export const OrganizationModel: Model<IOrganization> = model<IOrganization>(
  'Organization',
  organizationSchema
);

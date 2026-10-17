import { Schema, model, Document, Model, Types } from 'mongoose';

export type OrganizationRole = 'owner' | 'admin' | 'member';

export interface IMembership extends Document {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: OrganizationRole;
  createdAt: Date;
  updatedAt: Date;
}

const membershipSchema = new Schema<IMembership>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member',
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Compound unique index ensuring a user can only have one membership per org
membershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export const MembershipModel: Model<IMembership> = model<IMembership>(
  'Membership',
  membershipSchema
);

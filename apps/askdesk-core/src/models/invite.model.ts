import { Schema, model, Document, Model, Types } from 'mongoose';
import { OrganizationRole } from './membership.model.js';

export interface IInvite extends Document {
  organizationId: Types.ObjectId;
  email: string;
  role: OrganizationRole;
  tokenHash: string;
  invitedBy: Types.ObjectId;
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const inviteSchema = new Schema<IInvite>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member',
      required: true
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked'],
      default: 'pending',
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: '7d' }
    }
  },
  {
    timestamps: true
  }
);

export const InviteModel: Model<IInvite> = model<IInvite>('Invite', inviteSchema);

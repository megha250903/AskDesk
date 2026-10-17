import { Schema, model, Document, Model, Types } from 'mongoose';

export interface IAuditLog extends Document {
  actorId?: Types.ObjectId | null;
  organizationId?: Types.ObjectId | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true
    },
    action: {
      type: String,
      required: true,
      index: true
    },
    targetType: {
      type: String,
      default: null
    },
    targetId: {
      type: String,
      default: null
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null
    },
    ip: {
      type: String,
      default: null
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false } // Append-only, no updatedAt!
  }
);

// Compound index for fast tenant audit queries
auditLogSchema.index({ organizationId: 1, createdAt: -1 });

export const AuditLogModel: Model<IAuditLog> = model<IAuditLog>('AuditLog', auditLogSchema);

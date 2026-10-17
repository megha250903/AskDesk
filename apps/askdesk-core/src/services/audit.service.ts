import { Types } from 'mongoose';
import { AuditLogModel } from '../models/audit-log.model.js';

export interface AuditParams {
  actorId?: string | Types.ObjectId | null;
  organizationId?: string | Types.ObjectId | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}

export class AuditService {
  /**
   * Appends an audit entry asynchronously to maintain a tamper-resistant trail.
   */
  static async log(params: AuditParams): Promise<void> {
    try {
      const entry = new AuditLogModel({
        actorId: params.actorId ? new Types.ObjectId(params.actorId.toString()) : null,
        organizationId: params.organizationId
          ? new Types.ObjectId(params.organizationId.toString())
          : null,
        action: params.action,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        metadata: params.metadata ?? null,
        ip: params.ip ?? null
      });

      await entry.save();
    } catch (err) {
      // In production, send to telemetry/fallback logger so failures to audit don't crash main request
      console.error('[AuditService] Failed to record audit log:', err);
    }
  }
}

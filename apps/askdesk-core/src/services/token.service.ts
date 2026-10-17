import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { RefreshTokenModel, IRefreshToken } from '../models/refresh-token.model.js';

export class TokenService {
  /**
   * Hashes a raw refresh token using SHA-256 before database storage.
   */
  static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Generates a cryptographically strong random token string (64 characters).
   */
  static generateRawToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Issues a brand new refresh token and stores its hash in the database.
   */
  static async createSession(params: {
    userId: string | Types.ObjectId;
    userAgent?: string | null;
    ip?: string | null;
    familyId?: string;
  }): Promise<{ rawToken: string; session: IRefreshToken }> {
    const rawToken = this.generateRawToken();
    const tokenHash = this.hashToken(rawToken);
    const familyId = params.familyId ?? crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session = new RefreshTokenModel({
      userId: new Types.ObjectId(params.userId.toString()),
      tokenHash,
      familyId,
      userAgent: params.userAgent ?? null,
      ip: params.ip ?? null,
      isRevoked: false,
      expiresAt
    });

    await session.save();
    return { rawToken, session };
  }

  /**
   * Rotates a refresh token with reuse detection (Day 4):
   * If a token that has already been revoked is presented, the ENTIRE family is revoked.
   */
  static async rotateToken(
    rawToken: string,
    metadata: { userAgent?: string | null; ip?: string | null }
  ): Promise<
    | {
        success: true;
        newRawToken: string;
        userId: string;
      }
    | {
        success: false;
        reason: 'invalid' | 'expired' | 'reuse_detected';
      }
  > {
    const tokenHash = this.hashToken(rawToken);
    const existingToken = await RefreshTokenModel.findOne({ tokenHash });

    if (!existingToken) {
      return { success: false, reason: 'invalid' };
    }

    // Reuse detection: If token was already revoked, someone is replaying a stolen token!
    if (existingToken.isRevoked) {
      // Invalidate the whole family!
      await RefreshTokenModel.updateMany({ familyId: existingToken.familyId }, { isRevoked: true });
      return { success: false, reason: 'reuse_detected' };
    }

    // Check expiration
    if (existingToken.expiresAt < new Date()) {
      existingToken.isRevoked = true;
      await existingToken.save();
      return { success: false, reason: 'expired' };
    }

    // Single-use: Mark current token as revoked
    existingToken.isRevoked = true;
    await existingToken.save();

    // Issue new token in the same family
    const { rawToken: newRawToken } = await this.createSession({
      userId: existingToken.userId,
      userAgent: metadata.userAgent ?? existingToken.userAgent ?? null,
      ip: metadata.ip ?? existingToken.ip ?? null,
      familyId: existingToken.familyId
    });

    return {
      success: true,
      newRawToken,
      userId: existingToken.userId.toString()
    };
  }

  /**
   * Revokes a session or token family (Logout).
   */
  static async revokeToken(rawToken: string): Promise<boolean> {
    const tokenHash = this.hashToken(rawToken);
    const token = await RefreshTokenModel.findOne({ tokenHash });
    if (!token) return false;

    // Revoke the entire family on explicit logout
    await RefreshTokenModel.updateMany({ familyId: token.familyId }, { isRevoked: true });
    return true;
  }
}

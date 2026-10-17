import argon2 from 'argon2';

export class PasswordService {
  /**
   * Hashes a plaintext password using Argon2id with OWASP-recommended parameters.
   */
  static async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4
    });
  }

  /**
   * Verifies a plaintext password against an Argon2id hash in constant time.
   */
  static async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}

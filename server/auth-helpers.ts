import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const SALT_ROUNDS = 10;

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate a random token for magic links or password reset
 */
export function generateToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength（2026年5月強化版）
 * 条件:
 *  - 10文字以上 72文字以下（bcrypt の実用上限が 72 byte）
 *  - 英字・数字・記号のうち 2 種類以上を含む
 *  - 一般的な弱いパスワードを拒否
 */
const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password123', '12345678', '123456789', 'qwerty123',
  'abcd1234', 'admin1234', 'iloveyou', 'welcome1', 'letmein',
  'パスワード', 'ぱすわーど', '00000000', '11111111',
]);

export function isValidPassword(password: string): boolean {
  if (password.length < 10) return false;
  if (password.length > 72) return false; // bcrypt の上限保護
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) return false;

  let kinds = 0;
  if (/[a-zA-Z]/.test(password)) kinds += 1;
  if (/[0-9]/.test(password)) kinds += 1;
  if (/[!@#$%^&*(),.?":{}|<>_\-+=/\\\[\];'`~]/.test(password)) kinds += 1;

  return kinds >= 2;
}

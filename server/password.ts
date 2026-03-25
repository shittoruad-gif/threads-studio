import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Hash a plain text password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password strength
 * Requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 */
export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'パスワードは8文字以上である必要があります' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'パスワードには少なくとも1つの大文字が必要です' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'パスワードには少なくとも1つの小文字が必要です' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'パスワードには少なくとも1つの数字が必要です' };
  }

  return { valid: true };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): { valid: boolean; message?: string } {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email)) {
    return { valid: false, message: '有効なメールアドレスを入力してください' };
  }

  return { valid: true };
}

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
 * Validate password strength
 * - At least 8 characters
 * - Contains at least one number or special character
 */
export function isValidPassword(password: string): boolean {
  if (password.length < 8) return false;
  // Check for at least one number or special character
  const hasNumberOrSpecial = /[0-9!@#$%^&*(),.?":{}|<>]/.test(password);
  return hasNumberOrSpecial;
}

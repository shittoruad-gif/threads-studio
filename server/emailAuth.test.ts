import { describe, it, expect, beforeAll } from 'vitest';
import { hashPassword, verifyPassword, isValidEmail, isValidPassword } from './auth-helpers';
import * as db from './db';

describe('Email Authentication', () => {
  describe('Password Hashing', () => {
    it('should hash password correctly', async () => {
      const password = 'Test123!';
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should verify correct password', async () => {
      const password = 'Test123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);
      
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'Test123!';
      const wrongPassword = 'Wrong123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(wrongPassword, hash);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Email Validation', () => {
    it('should validate correct email', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name+tag@example.co.jp')).toBe(true);
    });

    it('should reject invalid email', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('invalid@')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
    });
  });

  describe('Password Validation', () => {
    // 現在のルール: 10文字以上、英字・数字・記号のうち2種類以上（server/auth-helpers.ts）
    it('should accept valid password', () => {
      expect(isValidPassword('Test123456!')).toBe(true);
      expect(isValidPassword('password12')).toBe(true);
      expect(isValidPassword('Pass@word!!')).toBe(true);
    });

    it('should reject password less than 10 characters', () => {
      expect(isValidPassword('Test1!')).toBe(false);
      expect(isValidPassword('abc123')).toBe(false);
      expect(isValidPassword('Pass1234!')).toBe(false); // 9文字
    });

    it('should reject password with only one kind of character', () => {
      expect(isValidPassword('passwordpassword')).toBe(false);
      expect(isValidPassword('Passwordonly')).toBe(false);
      expect(isValidPassword('1234567890')).toBe(false);
    });
  });

  describe('Database Operations', () => {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'Test123!';

    it('should create email user', async () => {
      const passwordHash = await hashPassword(testPassword);
      const user = await db.createEmailUser(testEmail, passwordHash, 'Test User');
      
      expect(user).toBeDefined();
      expect(user?.email).toBe(testEmail);
      expect(user?.name).toBe('Test User');
      expect(user?.authProvider).toBe('email');
      expect(user?.passwordHash).toBe(passwordHash);
    });

    it('should retrieve user by email', async () => {
      const user = await db.getUserByEmail(testEmail);
      
      expect(user).toBeDefined();
      expect(user?.email).toBe(testEmail);
      expect(user?.authProvider).toBe('email');
    });

    it('should return null for non-existent email', async () => {
      const user = await db.getUserByEmail('nonexistent@example.com');
      
      expect(user).toBeNull();
    });
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';
import { hashPassword } from './auth-helpers';

describe('Email Verification Flow', () => {
  let testUserId: number;
  let testUserEmail: string;
  let testUserOpenId: string;

  beforeAll(async () => {
    // Create test user
    testUserEmail = `test-verify-${Date.now()}@example.com`;
    testUserOpenId = `test-verify-openid-${Date.now()}`;
    const passwordHash = await hashPassword('TestPassword123!');
    
    await db.upsertUser({
      openId: testUserOpenId,
      email: testUserEmail,
      name: 'Test Verify User',
      authProvider: 'email',
      passwordHash,
    });

    const user = await db.getUserByEmail(testUserEmail);
    if (!user) throw new Error('Test user not created');
    testUserId = user.id;
  });

  it('should update email verification token', async () => {
    const token = 'test-verify-token-' + Date.now();
    
    await db.updateEmailVerificationToken(testUserId, token);

    const user = await db.getUserById(testUserId);
    expect(user?.emailVerificationToken).toBe(token);
  });

  it('should retrieve user by email verification token', async () => {
    const token = 'test-verify-token-retrieve-' + Date.now();
    
    await db.updateEmailVerificationToken(testUserId, token);
    const user = await db.getUserByEmailVerificationToken(token);

    expect(user).toBeDefined();
    expect(user?.id).toBe(testUserId);
    expect(user?.email).toBe(testUserEmail);
  });

  it('should update email verification status', async () => {
    await db.updateEmailVerificationStatus(testUserId, true);

    const user = await db.getUserById(testUserId);
    expect(user?.emailVerified).toBe(true);
  });

  it('should clear email verification token when verified', async () => {
    const token = 'test-verify-token-clear-' + Date.now();
    
    await db.updateEmailVerificationToken(testUserId, token);
    await db.updateEmailVerificationStatus(testUserId, true);

    const user = await db.getUserById(testUserId);
    expect(user?.emailVerified).toBe(true);
    expect(user?.emailVerificationToken).toBeNull();
  });

  it('should allow unverified user to be set back to unverified', async () => {
    await db.updateEmailVerificationStatus(testUserId, false);

    const user = await db.getUserById(testUserId);
    expect(user?.emailVerified).toBe(false);
  });
});

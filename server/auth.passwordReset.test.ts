import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';
import { hashPassword } from './auth-helpers';

describe('Password Reset Flow', () => {
  let testUserId: number;
  let testUserEmail: string;
  let testUserOpenId: string;

  beforeAll(async () => {
    // Create test user
    testUserEmail = `test-reset-${Date.now()}@example.com`;
    testUserOpenId = `test-reset-openid-${Date.now()}`;
    const passwordHash = await hashPassword('TestPassword123!');
    
    await db.upsertUser({
      openId: testUserOpenId,
      email: testUserEmail,
      name: 'Test Reset User',
      authProvider: 'email',
      passwordHash,
    });

    const user = await db.getUserByEmail(testUserEmail);
    if (!user) throw new Error('Test user not created');
    testUserId = user.id;
  });

  it('should create password reset token', async () => {
    const token = 'test-reset-token-' + Date.now();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const resetToken = await db.createPasswordResetToken(testUserId, token, expiresAt);

    expect(resetToken).toBeDefined();
    expect(resetToken?.userId).toBe(testUserId);
    expect(resetToken?.token).toBe(token);
  });

  it('should retrieve password reset token', async () => {
    const token = 'test-reset-token-retrieve-' + Date.now();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.createPasswordResetToken(testUserId, token, expiresAt);
    const retrievedToken = await db.getPasswordResetToken(token);

    expect(retrievedToken).toBeDefined();
    expect(retrievedToken?.token).toBe(token);
    expect(retrievedToken?.userId).toBe(testUserId);
  });

  it('should delete password reset token', async () => {
    const token = 'test-reset-token-delete-' + Date.now();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const resetToken = await db.createPasswordResetToken(testUserId, token, expiresAt);
    if (!resetToken) throw new Error('Reset token not created');

    await db.deletePasswordResetToken(resetToken.id);

    const deletedToken = await db.getPasswordResetToken(token);
    expect(deletedToken).toBeUndefined();
  });

  it('should delete all password reset tokens for a user', async () => {
    const token1 = 'test-reset-token-bulk-1-' + Date.now();
    const token2 = 'test-reset-token-bulk-2-' + Date.now();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.createPasswordResetToken(testUserId, token1, expiresAt);
    await db.createPasswordResetToken(testUserId, token2, expiresAt);

    await db.deletePasswordResetTokensByUserId(testUserId);

    const deletedToken1 = await db.getPasswordResetToken(token1);
    const deletedToken2 = await db.getPasswordResetToken(token2);

    expect(deletedToken1).toBeUndefined();
    expect(deletedToken2).toBeUndefined();
  });

  it('should update user password after reset', async () => {
    const newPasswordHash = await hashPassword('NewPassword456!');
    
    await db.updateUserPassword(testUserId, newPasswordHash);

    const updatedUser = await db.getUserByEmail(testUserEmail);
    expect(updatedUser?.passwordHash).toBe(newPasswordHash);
  });
});

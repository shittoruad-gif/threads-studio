import { describe, it, expect, beforeEach } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';

describe('auth.register', () => {
  const caller = appRouter.createCaller({
    user: undefined,
    req: {} as any,
    res: {} as any,
  });

  beforeEach(async () => {
    // Clean up test user if exists
    const testEmail = 'test-register@example.com';
    const existingUser = await db.getUserByEmail(testEmail);
    if (existingUser) {
      // Delete test user
      await db.deleteUser(existingUser.id);
    }
  });

  it('should successfully register a new user with valid credentials', async () => {
    const result = await caller.auth.register({
      name: 'Test User',
      email: 'test-register@example.com',
      password: 'Test1234!',
    });

    expect(result.success).toBe(true);
    expect(result.userId).toBeDefined();
    expect(typeof result.userId).toBe('number');

    // Verify user was created in database
    const user = await db.getUserByEmail('test-register@example.com');
    expect(user).toBeDefined();
    expect(user?.name).toBe('Test User');
    expect(user?.email).toBe('test-register@example.com');
    expect(user?.authProvider).toBe('email');
    expect(user?.passwordHash).toBeDefined();
  });

  it('should reject registration with invalid email', async () => {
    await expect(
      caller.auth.register({
        name: 'Test User',
        email: 'invalid-email',
        password: 'Test1234!',
      })
    ).rejects.toThrow();
  });

  it('should reject registration with weak password', async () => {
    await expect(
      caller.auth.register({
        name: 'Test User',
        email: 'test-weak@example.com',
        password: 'weak',
      })
    ).rejects.toThrow();
  });

  it('should reject registration with empty name', async () => {
    await expect(
      caller.auth.register({
        name: '',
        email: 'test-noname@example.com',
        password: 'Test1234!',
      })
    ).rejects.toThrow();
  });

  it('should reject registration with duplicate email', async () => {
    // First registration
    await caller.auth.register({
      name: 'Test User',
      email: 'test-duplicate@example.com',
      password: 'Test1234!',
    });

    // Second registration with same email should fail
    await expect(
      caller.auth.register({
        name: 'Another User',
        email: 'test-duplicate@example.com',
        password: 'Test1234!',
      })
    ).rejects.toThrow('このメールアドレスは既に登録されています');

    // Clean up
    const user = await db.getUserByEmail('test-duplicate@example.com');
    if (user) {
      await db.deleteUser(user.id);
    }
  });

  it('should hash password before storing', async () => {
    const password = 'Test1234!';
    const result = await caller.auth.register({
      name: 'Test User',
      email: 'test-hash@example.com',
      password,
    });

    const user = await db.getUserByEmail('test-hash@example.com');
    expect(user?.passwordHash).toBeDefined();
    expect(user?.passwordHash).not.toBe(password); // Password should be hashed

    // Clean up
    if (user) {
      await db.deleteUser(user.id);
    }
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';

describe('auth.login', () => {
  const testEmail = 'test-login@example.com';
  const testPassword = 'Test1234!';
  let testUserId: number;

  const caller = appRouter.createCaller({
    user: undefined,
    req: {
      protocol: 'https',
      headers: {
        'x-forwarded-proto': 'https',
        origin: 'http://localhost:3000',
      },
    } as any,
    res: {
      cookie: () => {},
      clearCookie: () => {},
    } as any,
  });

  beforeAll(async () => {
    // Clean up any existing test user first
    const existingUser = await db.getUserByEmail(testEmail);
    if (existingUser) {
      await db.deleteUser(existingUser.id);
    }

    // Create a test user for login tests
    const result = await caller.auth.register({
      name: 'Test Login User',
      email: testEmail,
      password: testPassword,
    });
    testUserId = result.userId;
  });

  afterAll(async () => {
    // Clean up test user
    if (testUserId) {
      await db.deleteUser(testUserId);
    }
  });

  it('should successfully login with valid credentials', async () => {
    const result = await caller.auth.login({
      email: testEmail,
      password: testPassword,
    });

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user.email).toBe(testEmail);
    expect(result.user.name).toBe('Test Login User');
    // authProvider is not included in the login response, only id/email/name
    expect(result.user.id).toBeDefined();
  });

  it('should reject login with incorrect email', async () => {
    await expect(
      caller.auth.login({
        email: 'nonexistent@example.com',
        password: testPassword,
      })
    ).rejects.toThrow('メールアドレスまたはパスワードが正しくありません');
  });

  it('should reject login with incorrect password', async () => {
    await expect(
      caller.auth.login({
        email: testEmail,
        password: 'WrongPassword123!',
      })
    ).rejects.toThrow('メールアドレスまたはパスワードが正しくありません');
  });

  it('should reject login with empty email', async () => {
    await expect(
      caller.auth.login({
        email: '',
        password: testPassword,
      })
    ).rejects.toThrow();
  });

  it('should reject login with empty password', async () => {
    await expect(
      caller.auth.login({
        email: testEmail,
        password: '',
      })
    ).rejects.toThrow('メールアドレスまたはパスワードが正しくありません');
  });

  it('should not expose password hash in response', async () => {
    const result = await caller.auth.login({
      email: testEmail,
      password: testPassword,
    });

    expect(result.user.passwordHash).toBeUndefined();
  });
});

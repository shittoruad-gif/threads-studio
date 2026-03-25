import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';
import * as threadsApi from './threadsApi';

// Mock user context
const mockUser = {
  id: 1,
  openId: 'test-open-id',
  name: 'Test User',
  email: 'test@example.com',
  role: 'user' as const,
};

const mockContext = {
  user: mockUser,
  req: {} as any,
  res: {} as any,
};

// Mock Threads account
const mockThreadsAccount = {
  id: 1,
  userId: 1,
  threadsUserId: 'threads_user_123',
  threadsUsername: 'testuser',
  accessToken: 'mock_access_token',
  expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
  profilePictureUrl: null,
  biography: null,
  followersCount: null,
  followingCount: null,
  lastSyncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock Threads API responses
const mockThreadsProfile = {
  id: 'threads_user_123',
  username: 'testuser',
  threads_profile_picture_url: 'https://example.com/profile.jpg',
  threads_biography: 'This is a test bio',
};

const mockThreadsCounts = {
  followersCount: 1500,
  followingCount: 300,
};

describe('Threads Profile Sync', () => {
  beforeAll(() => {
    // Mock database functions
    vi.spyOn(db, 'getThreadsAccountById').mockResolvedValue(mockThreadsAccount);
    vi.spyOn(db, 'updateThreadsAccountProfile').mockResolvedValue({
      ...mockThreadsAccount,
      threadsUsername: mockThreadsProfile.username,
      profilePictureUrl: mockThreadsProfile.threads_profile_picture_url,
      biography: mockThreadsProfile.threads_biography,
      followersCount: mockThreadsCounts.followersCount,
      followingCount: mockThreadsCounts.followingCount,
      lastSyncedAt: new Date(),
    });

    // Mock Threads API functions
    vi.spyOn(threadsApi, 'getThreadsUserProfile').mockResolvedValue(mockThreadsProfile);
    vi.spyOn(threadsApi, 'getThreadsUserCounts').mockResolvedValue(mockThreadsCounts);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('should sync profile from Threads API', async () => {
    const caller = appRouter.createCaller(mockContext);

    const result = await caller.threads.syncProfile({ accountId: 1 });

    expect(result.success).toBe(true);
    expect(result.account).toBeDefined();
    expect(result.account?.threadsUsername).toBe('testuser');
    expect(result.account?.profilePictureUrl).toBe('https://example.com/profile.jpg');
    expect(result.account?.biography).toBe('This is a test bio');
    expect(result.account?.followersCount).toBe(1500);
    expect(result.account?.followingCount).toBe(300);
    expect(result.account?.lastSyncedAt).toBeDefined();
    expect(result.message).toBe('プロフィールを同期しました');
  });

  it('should get profile information', async () => {
    const caller = appRouter.createCaller(mockContext);

    const result = await caller.threads.getProfile({ accountId: 1 });

    expect(result.id).toBe(1);
    expect(result.threadsUserId).toBe('threads_user_123');
    expect(result.threadsUsername).toBe('testuser');
  });

  it('should reject sync for non-owner account', async () => {
    const otherUserContext = {
      ...mockContext,
      user: { ...mockUser, id: 999 },
    };

    const caller = appRouter.createCaller(otherUserContext);

    await expect(
      caller.threads.syncProfile({ accountId: 1 })
    ).rejects.toThrow('Account not found');
  });

  it('should reject get profile for non-owner account', async () => {
    const otherUserContext = {
      ...mockContext,
      user: { ...mockUser, id: 999 },
    };

    const caller = appRouter.createCaller(otherUserContext);

    await expect(
      caller.threads.getProfile({ accountId: 1 })
    ).rejects.toThrow('Account not found');
  });

  it('should handle Threads API errors gracefully', async () => {
    // Mock API error
    vi.spyOn(threadsApi, 'getThreadsUserProfile').mockRejectedValueOnce(
      new Error('Threads API error')
    );

    const caller = appRouter.createCaller(mockContext);

    await expect(
      caller.threads.syncProfile({ accountId: 1 })
    ).rejects.toThrow('プロフィールの同期に失敗しました');
  });

  it('should handle missing account gracefully', async () => {
    vi.spyOn(db, 'getThreadsAccountById').mockResolvedValueOnce(null);

    const caller = appRouter.createCaller(mockContext);

    await expect(
      caller.threads.syncProfile({ accountId: 999 })
    ).rejects.toThrow('Account not found');
  });
});

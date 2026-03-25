import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as db from './db';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/trpc';

describe('Univapay Subscription Management', () => {
  let testUserId: number;
  let testUser2Id: number;
  let testUser3Id: number;
  let testUser4Id: number;

  const mockContext: TrpcContext = {
    user: {
      id: 0, // Will be set in beforeAll
      openId: 'test-open-id',
      name: 'Test User',
      email: 'test@example.com',
      loginMethod: 'email',
      role: 'user',
      stripeCustomerId: null,
      onboardingCompleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as any,
    res: {} as any,
  };

  beforeAll(async () => {
    // Create test users using upsertUser
    await db.upsertUser({
      openId: 'test-univapay-user-1',
      name: 'Univapay Test User 1',
      email: 'univapay1@test.com',
      loginMethod: 'email',
      role: 'user',
    });
    const user1 = await db.getUserByOpenId('test-univapay-user-1');
    if (!user1) throw new Error('Failed to create test user 1');
    testUserId = user1.id;
    mockContext.user!.id = testUserId;

    await db.upsertUser({
      openId: 'test-univapay-user-2',
      name: 'Univapay Test User 2',
      email: 'univapay2@test.com',
      loginMethod: 'email',
      role: 'user',
    });
    const user2 = await db.getUserByOpenId('test-univapay-user-2');
    if (!user2) throw new Error('Failed to create test user 2');
    testUser2Id = user2.id;

    await db.upsertUser({
      openId: 'test-univapay-user-3',
      name: 'Univapay Test User 3',
      email: 'univapay3@test.com',
      loginMethod: 'email',
      role: 'user',
    });
    const user3 = await db.getUserByOpenId('test-univapay-user-3');
    if (!user3) throw new Error('Failed to create test user 3');
    testUser3Id = user3.id;

    await db.upsertUser({
      openId: 'test-univapay-user-4',
      name: 'Univapay Test User 4',
      email: 'univapay4@test.com',
      loginMethod: 'email',
      role: 'user',
    });
    const user4 = await db.getUserByOpenId('test-univapay-user-4');
    if (!user4) throw new Error('Failed to create test user 4');
    testUser4Id = user4.id;

    // Create test user subscription with univapaySubscriptionId
    await db.createSubscription({
      userId: testUserId,
      planId: 'pro',
      univapaySubscriptionId: 'test-univapay-sub-id',
      status: 'active',
      trialEndsAt: null,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
    });
  });

  describe('cancelSubscription', () => {
    it('should throw error if no subscription exists', async () => {
      const contextWithoutSub: TrpcContext = {
        ...mockContext,
        user: {
          ...mockContext.user!,
          id: testUser2Id, // User without subscription
        },
      };
      const callerWithoutSub = appRouter.createCaller(contextWithoutSub);

      await expect(
        callerWithoutSub.univapay.cancelSubscription()
      ).rejects.toThrow('アクティブなサブスクリプションが見つかりません。');
    });

    it('should throw error if no univapaySubscriptionId exists', async () => {
      // Create subscription without univapaySubscriptionId
      await db.createSubscription({
        userId: testUser3Id,
        planId: 'light',
        univapaySubscriptionId: null,
        status: 'active',
        trialEndsAt: null,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      });

      const contextWithoutUnivapayId: TrpcContext = {
        ...mockContext,
        user: {
          ...mockContext.user!,
          id: testUser3Id,
        },
      };
      const callerWithoutUnivapayId = appRouter.createCaller(contextWithoutUnivapayId);

      await expect(
        callerWithoutUnivapayId.univapay.cancelSubscription()
      ).rejects.toThrow('Univapayサブスクリプションが見つかりません。');
    });

    it('should fail to cancel subscription without real Univapay credentials', async () => {
      const caller = appRouter.createCaller(mockContext);

      // This test will fail because we don't have actual Univapay credentials
      // In production, you should use Univapay test environment
      await expect(
        caller.univapay.cancelSubscription()
      ).rejects.toThrow();
    });
  });

  describe('changePlan', () => {
    it('should throw error if current plan is free', async () => {
      // Create free plan subscription
      await db.createSubscription({
        userId: testUser4Id,
        planId: 'free',
        univapaySubscriptionId: 'test-free-sub-id',
        status: 'active',
        trialEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });

      const contextWithFreePlan: TrpcContext = {
        ...mockContext,
        user: {
          ...mockContext.user!,
          id: testUser4Id,
        },
      };
      const callerWithFreePlan = appRouter.createCaller(contextWithFreePlan);

      await expect(
        callerWithFreePlan.univapay.changePlan({ newPlanId: 'pro' })
      ).rejects.toThrow('無料プランからの変更は新規購入として行ってください。');
    });

    it('should throw error if new plan is same as current plan', async () => {
      const caller = appRouter.createCaller(mockContext);

      await expect(
        caller.univapay.changePlan({ newPlanId: 'pro' })
      ).rejects.toThrow('現在と同じプランには変更できません。');
    });

    it('should fail to change plan without real Univapay credentials', async () => {
      const caller = appRouter.createCaller(mockContext);

      // This test will fail because we don't have actual Univapay credentials
      // In production, you should use Univapay test environment
      await expect(
        caller.univapay.changePlan({ newPlanId: 'business' })
      ).rejects.toThrow();
    });
  });
});

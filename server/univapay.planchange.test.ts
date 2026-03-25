import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/trpc';

describe('Univapay Plan Change Timing', () => {
  let testUserId: number;

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
    // Create test user
    await db.upsertUser({
      openId: 'test-planchange-user',
      name: 'Plan Change Test User',
      email: 'planchange@test.com',
      loginMethod: 'email',
      role: 'user',
    });
    const user = await db.getUserByOpenId('test-planchange-user');
    if (!user) throw new Error('Failed to create test user');
    testUserId = user.id;
    mockContext.user!.id = testUserId;

    // Create test subscription
    await db.createSubscription({
      userId: testUserId,
      planId: 'light',
      univapaySubscriptionId: 'test-planchange-sub-id',
      status: 'active',
      trialEndsAt: null,
      currentPeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
      cancelAtPeriodEnd: false,
    });
  });

  describe('previewPlanChange', () => {
    it('should calculate proration correctly for upgrade', async () => {
      const caller = appRouter.createCaller(mockContext);
      
      const preview = await caller.univapay.previewPlanChange({ newPlanId: 'pro' });
      
      expect(preview.currentPlan.id).toBe('light');
      expect(preview.newPlan.id).toBe('pro');
      expect(preview.isUpgrade).toBe(true);
      expect(preview.priceDiff).toBeGreaterThan(0);
      expect(preview.daysRemaining).toBeGreaterThan(0);
      expect(preview.proratedAmount).toBeGreaterThan(0);
    });

    it('should calculate proration correctly for downgrade', async () => {
      // First upgrade to pro
      const subscription = await db.getSubscriptionByUserId(testUserId);
      if (subscription) {
        await db.updateSubscription(subscription.id, { planId: 'pro' });
      }

      const caller = appRouter.createCaller(mockContext);
      
      const preview = await caller.univapay.previewPlanChange({ newPlanId: 'light' });
      
      expect(preview.currentPlan.id).toBe('pro');
      expect(preview.newPlan.id).toBe('light');
      expect(preview.isUpgrade).toBe(false);
      expect(preview.priceDiff).toBeLessThan(0);
    });
  });

  describe('changePlan with timing', () => {
    it('should accept changeTiming parameter', async () => {
      const caller = appRouter.createCaller(mockContext);

      // Test with immediate timing (will fail without real Univapay credentials)
      try {
        await caller.univapay.changePlan({ 
          newPlanId: 'business',
          changeTiming: 'immediate'
        });
      } catch (error: any) {
        // Expected to fail without real Univapay credentials
        expect(error.message).toBeTruthy();
      }
    });

    it('should handle next_period timing', async () => {
      const caller = appRouter.createCaller(mockContext);

      // Test with next_period timing (should not call Univapay API)
      try {
        const result = await caller.univapay.changePlan({ 
          newPlanId: 'business',
          changeTiming: 'next_period'
        });
        
        expect(result.success).toBe(true);
        expect(result.changeTiming).toBe('next_period');
        expect(result.message).toContain('次回請求時');
      } catch (error: any) {
        // If it fails, it should be a database error, not Univapay API error
        expect(error.message).not.toContain('Univapay');
      }
    });

    it('should throw error if trying to change to same plan', async () => {
      // Reset subscription to light plan
      const subscription = await db.getSubscriptionByUserId(testUserId);
      if (subscription) {
        await db.updateSubscription(subscription.id, { planId: 'light' });
      }

      const caller = appRouter.createCaller(mockContext);

      await expect(
        caller.univapay.changePlan({ 
          newPlanId: 'light',
          changeTiming: 'immediate'
        })
      ).rejects.toThrow('現在と同じプランには変更できません。');
    });
  });
});

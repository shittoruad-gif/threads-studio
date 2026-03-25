import { describe, it, expect } from 'vitest';
import { PLANS, getPlan, isLimitExceeded, hasFeature, getFeatureLimitText } from '../shared/plans';

describe('Plan Limits', () => {
  describe('getPlan', () => {
    it('should return correct plan by ID', () => {
      const lightPlan = getPlan('light');
      expect(lightPlan).toBeDefined();
      expect(lightPlan?.id).toBe('light');
      expect(lightPlan?.priceMonthly).toBe(2980);
    });

    it('should return undefined for invalid plan ID', () => {
      const invalidPlan = getPlan('invalid');
      expect(invalidPlan).toBeUndefined();
    });
  });

  describe('Plan Features', () => {
    it('light plan should have correct limits', () => {
      const plan = PLANS.light;
      expect(plan.priceMonthly).toBe(2980);
      expect(plan.features.maxProjects).toBe(3);
      expect(plan.features.maxThreadsAccounts).toBe(1);
      expect(plan.features.maxScheduledPosts).toBe(10);
      expect(plan.features.maxAiGenerations).toBe(10);
      expect(plan.features.hasPrioritySupport).toBe(false);
    });

    it('pro plan should have correct limits', () => {
      const plan = PLANS.pro;
      expect(plan.priceMonthly).toBe(9800);
      expect(plan.features.maxProjects).toBe(10);
      expect(plan.features.maxThreadsAccounts).toBe(3);
      expect(plan.features.maxScheduledPosts).toBe(100);
      expect(plan.features.maxAiGenerations).toBe(-1); // Unlimited
      expect(plan.popular).toBe(true);
    });

    it('business plan should have correct limits', () => {
      const plan = PLANS.business;
      expect(plan.priceMonthly).toBe(29800);
      expect(plan.features.maxProjects).toBe(50);
      expect(plan.features.maxThreadsAccounts).toBe(10);
      expect(plan.features.maxScheduledPosts).toBe(500);
      expect(plan.features.hasPrioritySupport).toBe(true);
    });

    it('agency plan should have correct limits', () => {
      const plan = PLANS.agency;
      expect(plan.priceMonthly).toBe(50000);
      expect(plan.features.maxProjects).toBe(-1); // Unlimited
      expect(plan.features.maxThreadsAccounts).toBe(-1); // Unlimited
      expect(plan.features.maxScheduledPosts).toBe(-1); // Unlimited
      expect(plan.features.hasApiAccess).toBe(true);
    });
  });

  describe('hasFeature', () => {
    it('should return true for AI generation in light plan', () => {
      expect(hasFeature('light', 'maxAiGenerations')).toBe(true);
    });

    it('should return true for priority support in business plan', () => {
      expect(hasFeature('business', 'hasPrioritySupport')).toBe(true);
    });

    it('should return false for priority support in pro plan', () => {
      expect(hasFeature('pro', 'hasPrioritySupport')).toBe(false);
    });

    it('should return false for invalid plan', () => {
      expect(hasFeature('invalid', 'maxAiGenerations')).toBe(false);
    });
  });

  describe('isLimitExceeded', () => {
    it('should return true when limit is exceeded', () => {
      expect(isLimitExceeded('light', 'maxProjects', 3)).toBe(true);
      expect(isLimitExceeded('light', 'maxProjects', 5)).toBe(true);
    });

    it('should return false when under limit', () => {
      expect(isLimitExceeded('light', 'maxProjects', 2)).toBe(false);
    });

    it('should return false for unlimited features', () => {
      expect(isLimitExceeded('agency', 'maxProjects', 1000)).toBe(false);
      expect(isLimitExceeded('agency', 'maxScheduledPosts', 10000)).toBe(false);
    });

    it('should return true for invalid plan', () => {
      expect(isLimitExceeded('invalid', 'maxProjects', 1)).toBe(true);
    });
  });

  describe('getFeatureLimitText', () => {
    it('should return "無制限" for unlimited features', () => {
      expect(getFeatureLimitText(-1)).toBe('無制限');
    });

    it('should return "なし" for zero limit', () => {
      expect(getFeatureLimitText(0)).toBe('なし');
    });

    it('should return count with "件" suffix', () => {
      expect(getFeatureLimitText(3)).toBe('3件');
      expect(getFeatureLimitText(50)).toBe('50件');
      expect(getFeatureLimitText(100)).toBe('100件');
    });
  });

  describe('Monthly Post Limits', () => {
    it('light plan should have 10 posts per month', () => {
      const plan = PLANS.light;
      expect(plan.features.maxScheduledPosts).toBe(10);
    });

    it('pro plan should have 100 posts per month', () => {
      const plan = PLANS.pro;
      expect(plan.features.maxScheduledPosts).toBe(100);
    });

    it('business plan should have 500 posts per month', () => {
      expect(PLANS.business.features.maxScheduledPosts).toBe(500);
    });

    it('agency plan should have unlimited posts', () => {
      expect(PLANS.agency.features.maxScheduledPosts).toBe(-1);
    });
  });

  describe('Account Limits', () => {
    it('should enforce correct account limits per plan', () => {
      expect(PLANS.light.features.maxThreadsAccounts).toBe(1);
      expect(PLANS.pro.features.maxThreadsAccounts).toBe(3);
      expect(PLANS.business.features.maxThreadsAccounts).toBe(10);
      expect(PLANS.agency.features.maxThreadsAccounts).toBe(-1); // Unlimited
    });
  });

  describe('Project Limits', () => {
    it('should enforce correct project limits per plan', () => {
      expect(PLANS.light.features.maxProjects).toBe(3);
      expect(PLANS.pro.features.maxProjects).toBe(10);
      expect(PLANS.business.features.maxProjects).toBe(50);
      expect(PLANS.agency.features.maxProjects).toBe(-1); // Unlimited
    });
  });
});

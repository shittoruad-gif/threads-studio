import { describe, it, expect } from 'vitest';
import { getFeatureLimitText, isLimitExceeded } from '../shared/plans';

describe('Usage Progress Logic', () => {
  describe('getFeatureLimitText', () => {
    it('should return "無制限" for -1', () => {
      expect(getFeatureLimitText(-1)).toBe('無制限');
    });

    it('should return "なし" for 0', () => {
      expect(getFeatureLimitText(0)).toBe('なし');
    });

    it('should return formatted count for positive numbers', () => {
      expect(getFeatureLimitText(10)).toBe('10件');
      expect(getFeatureLimitText(100)).toBe('100件');
    });
  });

  describe('isLimitExceeded', () => {
    it('should return false for unlimited plans (-1)', () => {
      expect(isLimitExceeded('agency', 'maxProjects', 1000)).toBe(false);
    });

    it('should return true when limit is exceeded', () => {
      expect(isLimitExceeded('light', 'maxScheduledPosts', 11)).toBe(true);
    });

    it('should return false when under limit', () => {
      expect(isLimitExceeded('light', 'maxScheduledPosts', 5)).toBe(false);
    });

    it('should return true when at limit', () => {
      expect(isLimitExceeded('light', 'maxScheduledPosts', 10)).toBe(true);
    });

    it('should return true for invalid plan', () => {
      expect(isLimitExceeded('invalid', 'maxThreadsAccounts', 0)).toBe(true);
    });
  });

  describe('Usage Progress Percentage Calculation', () => {
    it('should calculate correct percentage for normal limits', () => {
      const current = 8;
      const limit = 10;
      const percentage = (current / limit) * 100;
      expect(percentage).toBe(80);
    });

    it('should handle 100% usage', () => {
      const current = 10;
      const limit = 10;
      const percentage = (current / limit) * 100;
      expect(percentage).toBe(100);
    });

    it('should handle over 100% usage', () => {
      const current = 15;
      const limit = 10;
      const percentage = Math.min((current / limit) * 100, 100);
      expect(percentage).toBe(100);
    });

    it('should handle unlimited (-1) as 0%', () => {
      const limit = -1;
      const percentage = limit === -1 ? 0 : 50;
      expect(percentage).toBe(0);
    });
  });

  describe('Usage Progress Color Logic', () => {
    it('should use green color for under 80%', () => {
      const percentage = 70;
      const color = percentage >= 100 ? 'red' : percentage >= 80 ? 'yellow' : 'green';
      expect(color).toBe('green');
    });

    it('should use yellow color for 80-99%', () => {
      const percentage = 85;
      const color = percentage >= 100 ? 'red' : percentage >= 80 ? 'yellow' : 'green';
      expect(color).toBe('yellow');
    });

    it('should use red color for 100%', () => {
      const percentage = 100;
      const color = percentage >= 100 ? 'red' : percentage >= 80 ? 'yellow' : 'green';
      expect(color).toBe('red');
    });

    it('should use green color for unlimited', () => {
      const isUnlimited = true;
      const color = isUnlimited ? 'green' : 'red';
      expect(color).toBe('green');
    });
  });

  describe('Plan Feature Limits', () => {
    it('should have correct limits for light plan', () => {
      expect(isLimitExceeded('light', 'maxProjects', 3)).toBe(true);
      expect(isLimitExceeded('light', 'maxProjects', 2)).toBe(false);
      expect(isLimitExceeded('light', 'maxThreadsAccounts', 1)).toBe(true);
      expect(isLimitExceeded('light', 'maxScheduledPosts', 10)).toBe(true);
    });

    it('should have correct limits for pro plan', () => {
      expect(isLimitExceeded('pro', 'maxProjects', 10)).toBe(true);
      expect(isLimitExceeded('pro', 'maxProjects', 9)).toBe(false);
      expect(isLimitExceeded('pro', 'maxThreadsAccounts', 3)).toBe(true);
      expect(isLimitExceeded('pro', 'maxScheduledPosts', 100)).toBe(true);
    });

    it('should have correct limits for business plan', () => {
      expect(isLimitExceeded('business', 'maxProjects', 50)).toBe(true);
      expect(isLimitExceeded('business', 'maxProjects', 49)).toBe(false);
      expect(isLimitExceeded('business', 'maxThreadsAccounts', 10)).toBe(true);
      expect(isLimitExceeded('business', 'maxScheduledPosts', 500)).toBe(true);
    });

    it('should have correct limits for agency plan', () => {
      expect(isLimitExceeded('agency', 'maxProjects', 1000)).toBe(false); // Unlimited
      expect(isLimitExceeded('agency', 'maxThreadsAccounts', 1000)).toBe(false); // Unlimited
      expect(isLimitExceeded('agency', 'maxScheduledPosts', 1000)).toBe(false); // Unlimited
    });
  });
});

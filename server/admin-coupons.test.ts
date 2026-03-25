import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';

describe('Campaign Code Management', () => {
  let testCouponId: number;

  it('should create a new coupon', async () => {
    const id = await db.createCoupon({
      code: `TEST_${Date.now()}`,
      type: 'trial_30',
      description: 'Test coupon for 30-day trial',
      maxUses: 100,
    });

    expect(id).toBeGreaterThan(0);
    testCouponId = id;
  });

  it('should get coupon by ID', async () => {
    const coupon = await db.getCouponById(testCouponId);
    
    expect(coupon).toBeDefined();
    expect(coupon?.type).toBe('trial_30');
    expect(coupon?.description).toBe('Test coupon for 30-day trial');
    expect(coupon?.maxUses).toBe(100);
    expect(coupon?.usedCount).toBe(0);
    expect(coupon?.isActive).toBe(true);
  });

  it('should list all coupons', async () => {
    const coupons = await db.getAllCoupons(10, 0);
    
    expect(Array.isArray(coupons)).toBe(true);
    expect(coupons.length).toBeGreaterThan(0);
  });

  it('should count coupons', async () => {
    const count = await db.countCoupons();
    
    expect(count).toBeGreaterThan(0);
  });

  it('should update coupon', async () => {
    const success = await db.updateCoupon(testCouponId, {
      description: 'Updated description',
      maxUses: 200,
      isActive: false,
    });

    expect(success).toBe(true);

    const updated = await db.getCouponById(testCouponId);
    expect(updated?.description).toBe('Updated description');
    expect(updated?.maxUses).toBe(200);
    expect(updated?.isActive).toBe(false);
  });

  it('should get coupon usage stats', async () => {
    const stats = await db.getCouponUsageStats(testCouponId);
    
    expect(stats).toBeDefined();
    expect(stats?.coupon.id).toBe(testCouponId);
    expect(stats?.usedCount).toBe(0);
    expect(stats?.maxUses).toBe(200);
    expect(Array.isArray(stats?.users)).toBe(true);
  });

  it('should delete coupon', async () => {
    const success = await db.deleteCoupon(testCouponId);
    
    expect(success).toBe(true);

    const deleted = await db.getCouponById(testCouponId);
    expect(deleted).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import * as db from './db';
import { PLANS } from '../shared/plans';

describe('AI Generation Usage Tracking', () => {
  it('should return 0 count and correct limit for new user', async () => {
    // Create a test user with Light plan
    const openId = `test-ai-usage-user-1-${Date.now()}-${Math.random()}`;
    await db.upsertUser({
      openId,
      email: `ai-usage-1-${Date.now()}@test.com`,
      name: 'AI Usage Test User 1',
      loginMethod: 'email',
      role: 'user',
    });
    const user = await db.getUserByOpenId(openId);
    if (!user) throw new Error('Failed to create test user');

    await db.createSubscription({
      userId: user.id,
      planId: 'light',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const usage = await db.getAiGenerationUsage(user.id);
    
    expect(usage.count).toBe(0);
    expect(usage.limit).toBe(PLANS.light.features.maxAiGenerations); // 10 for Light plan
  });

  it('should increment AI generation count', async () => {
    // Create a test user
    const openId = `test-ai-usage-user-2-${Date.now()}-${Math.random()}`;
    await db.upsertUser({
      openId,
      email: `ai-usage-2-${Date.now()}@test.com`,
      name: 'AI Usage Test User 2',
      loginMethod: 'email',
      role: 'user',
    });
    const user = await db.getUserByOpenId(openId);
    if (!user) throw new Error('Failed to create test user');

    await db.createSubscription({
      userId: user.id,
      planId: 'light',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    await db.incrementAiGenerationUsage(user.id);
    
    const usage = await db.getAiGenerationUsage(user.id);
    expect(usage.count).toBe(1);
  });

  it('should increment multiple times', async () => {
    // Create a test user
    const openId = `test-ai-usage-user-3-${Date.now()}-${Math.random()}`;
    await db.upsertUser({
      openId,
      email: `ai-usage-3-${Date.now()}@test.com`,
      name: 'AI Usage Test User 3',
      loginMethod: 'email',
      role: 'user',
    });
    const user = await db.getUserByOpenId(openId);
    if (!user) throw new Error('Failed to create test user');

    await db.createSubscription({
      userId: user.id,
      planId: 'light',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    await db.incrementAiGenerationUsage(user.id);
    await db.incrementAiGenerationUsage(user.id);
    await db.incrementAiGenerationUsage(user.id);
    
    const usage = await db.getAiGenerationUsage(user.id);
    expect(usage.count).toBe(3);
  });

  it('should check limit correctly when under limit', async () => {
    // Create a test user
    const openId = `test-ai-usage-user-4-${Date.now()}-${Math.random()}`;
    await db.upsertUser({
      openId,
      email: `ai-usage-4-${Date.now()}@test.com`,
      name: 'AI Usage Test User 4',
      loginMethod: 'email',
      role: 'user',
    });
    const user = await db.getUserByOpenId(openId);
    if (!user) throw new Error('Failed to create test user');

    await db.createSubscription({
      userId: user.id,
      planId: 'light',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Add 5 generations (under the limit of 10)
    for (let i = 0; i < 5; i++) {
      await db.incrementAiGenerationUsage(user.id);
    }

    const canGenerate = await db.checkAiGenerationLimit(user.id);
    expect(canGenerate).toBe(true);
  });

  it('should check limit correctly when at limit', { timeout: 10000 }, async () => {
    // Create a test user
    const openId = `test-ai-usage-user-5-${Date.now()}-${Math.random()}`;
    await db.upsertUser({
      openId,
      email: `ai-usage-5-${Date.now()}@test.com`,
      name: 'AI Usage Test User 5',
      loginMethod: 'email',
      role: 'user',
    });
    const user = await db.getUserByOpenId(openId);
    if (!user) throw new Error('Failed to create test user');

    await db.createSubscription({
      userId: user.id,
      planId: 'light',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Increment to reach the limit (10 for Light plan)
    for (let i = 0; i < 10; i++) {
      await db.incrementAiGenerationUsage(user.id);
    }
    
    const usage = await db.getAiGenerationUsage(user.id);
    expect(usage.count).toBe(10);
    
    const canGenerate = await db.checkAiGenerationLimit(user.id);
    expect(canGenerate).toBe(false);
  });

  it('should return unlimited for Pro plan', async () => {
    // Create another user with Pro plan
    await db.upsertUser({
      openId: 'test-pro-user',
      email: 'pro@test.com',
      name: 'Pro User',
      loginMethod: 'email',
      role: 'user',
    });
    const proUser = await db.getUserByOpenId('test-pro-user');
    if (!proUser) throw new Error('Failed to create pro user');

    await db.createSubscription({
      userId: proUser.id,
      planId: 'pro',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const usage = await db.getAiGenerationUsage(proUser.id);
    expect(usage.limit).toBe(-1); // Unlimited

    // Should always be able to generate
    const canGenerate = await db.checkAiGenerationLimit(proUser.id);
    expect(canGenerate).toBe(true);
  });

  it('should return 0 limit for free plan', async () => {
    // Create another user with no subscription (free plan)
    await db.upsertUser({
      openId: 'test-free-user',
      email: 'free@test.com',
      name: 'Free User',
      loginMethod: 'email',
      role: 'user',
    });
    const freeUser = await db.getUserByOpenId('test-free-user');
    if (!freeUser) throw new Error('Failed to create free user');

    const usage = await db.getAiGenerationUsage(freeUser.id);
    expect(usage.limit).toBe(0); // No AI generation for free plan

    // Should not be able to generate
    const canGenerate = await db.checkAiGenerationLimit(freeUser.id);
    expect(canGenerate).toBe(false);
  });
});

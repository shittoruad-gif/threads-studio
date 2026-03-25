import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database module
vi.mock('./db', () => ({
  getSubscriptionByUserId: vi.fn(),
  getProjectsByUserId: vi.fn(),
  getProjectById: vi.fn(),
  createProject: vi.fn(),
  countUserProjects: vi.fn(),
  getThreadsAccountsByUserId: vi.fn(),
  getScheduledPostsByUserId: vi.fn(),
  countUserScheduledPosts: vi.fn(),
}));

// Mock the stripe module
vi.mock('./stripe', () => ({
  createCheckoutSession: vi.fn(),
  createBillingPortalSession: vi.fn(),
  cancelSubscription: vi.fn(),
  resumeSubscription: vi.fn(),
  getInvoices: vi.fn(),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    stripeCustomerId: null,
    ...overrides,
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {
        origin: "http://localhost:3000",
      },
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("subscription.getStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns free plan status when user has no subscription", async () => {
    const db = await import('./db');
    vi.mocked(db.getSubscriptionByUserId).mockResolvedValue(undefined);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.subscription.getStatus();

    expect(result.planId).toBe('free');
    expect(result.status).toBe('active');
    expect(result.isTrialing).toBe(false);
  });

  it("returns subscription status when user has active subscription", async () => {
    const db = await import('./db');
    vi.mocked(db.getSubscriptionByUserId).mockResolvedValue({
      id: 1,
      userId: 1,
      planId: 'pro',
      stripeSubscriptionId: 'sub_123',
      status: 'active',
      trialEndsAt: null,
      currentPeriodEnd: new Date('2025-01-15'),
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.subscription.getStatus();

    expect(result.planId).toBe('pro');
    expect(result.status).toBe('active');
    expect(result.isTrialing).toBe(false);
  });

  it("returns trialing status when user is in trial period", async () => {
    const db = await import('./db');
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);
    
    vi.mocked(db.getSubscriptionByUserId).mockResolvedValue({
      id: 1,
      userId: 1,
      planId: 'light',
      stripeSubscriptionId: 'sub_456',
      status: 'trialing',
      trialEndsAt: trialEnd,
      currentPeriodEnd: trialEnd,
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.subscription.getStatus();

    expect(result.planId).toBe('light');
    expect(result.status).toBe('trialing');
    expect(result.isTrialing).toBe(true);
    expect(result.trialEndsAt).toEqual(trialEnd);
  });
});

describe("subscription.getPlans", () => {
  it("returns all available plans", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.subscription.getPlans();

    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBeGreaterThan(0);
    
    // Check that plans have required properties
    result.forEach(plan => {
      expect(plan).toHaveProperty('id');
      expect(plan).toHaveProperty('name');
      expect(plan).toHaveProperty('priceMonthly');
      expect(plan).toHaveProperty('features');
    });
  });
});

describe("subscription.createCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws error for invalid plan", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.subscription.createCheckout({ planId: 'invalid-plan' })
    ).rejects.toThrow('Invalid plan');
  });

  it("creates checkout session for valid paid plan", async () => {
    const stripeService = await import('./stripe');
    vi.mocked(stripeService.createCheckoutSession).mockResolvedValue('https://checkout.stripe.com/session_123');

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.subscription.createCheckout({ planId: 'light' });

    expect(result.url).toBe('https://checkout.stripe.com/session_123');
    expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
      1, // userId
      'test@example.com',
      'Test User',
      'light',
      expect.any(String)
    );
  });
});

describe("project.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows project creation within limit", async () => {
    const db = await import('./db');
    vi.mocked(db.getSubscriptionByUserId).mockResolvedValue(undefined); // No subscription (free)
    vi.mocked(db.countUserProjects).mockResolvedValue(2); // 2 of 3 projects used
    vi.mocked(db.createProject).mockResolvedValue();

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.project.create({
      id: 'proj_123',
      title: 'Test Project',
    });

    expect(result.success).toBe(true);
    expect(db.createProject).toHaveBeenCalled();
  });

  it("blocks project creation when limit reached for light plan", async () => {
    const db = await import('./db');
    vi.mocked(db.getSubscriptionByUserId).mockResolvedValue({
      id: 1,
      userId: 1,
      planId: 'light',
      stripeSubscriptionId: 'sub_123',
      status: 'active',
      trialEndsAt: null,
      currentPeriodEnd: new Date('2025-12-31'),
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(db.countUserProjects).mockResolvedValue(3); // 3 of 3 projects used (at limit for light plan)

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.project.create({
        id: 'proj_456',
        title: 'Another Project',
      })
    ).rejects.toThrow(/上限/);
  });
});

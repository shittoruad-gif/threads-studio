import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(userId: number = 1, onboardingCompleted: boolean = false): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "test-onboarding-user",
    email: "onboarding@test.com",
    name: "Onboarding Test User",
    loginMethod: "manus",
    role: "user",
    onboardingCompleted,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Onboarding System", () => {
  it("should mark onboarding as completed", async () => {
    const ctx = createTestContext(1, false);
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.onboarding.complete();
    
    expect(result.success).toBe(true);
  });

  it("should reset onboarding status", async () => {
    const ctx = createTestContext(1, true);
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.onboarding.reset();
    
    expect(result.success).toBe(true);
  });

  it("should require authentication for onboarding operations", async () => {
    const unauthCtx: TrpcContext = {
      user: null,
      req: {
        protocol: "https",
        headers: {},
      } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(unauthCtx);
    
    // Should throw UNAUTHORIZED error
    await expect(caller.onboarding.complete()).rejects.toThrow();
    await expect(caller.onboarding.reset()).rejects.toThrow();
  });

  it("should handle multiple complete calls gracefully", async () => {
    const ctx = createTestContext(1, false);
    const caller = appRouter.createCaller(ctx);
    
    // First call
    const result1 = await caller.onboarding.complete();
    expect(result1.success).toBe(true);
    
    // Second call (already completed)
    const result2 = await caller.onboarding.complete();
    expect(result2.success).toBe(true);
  });
});

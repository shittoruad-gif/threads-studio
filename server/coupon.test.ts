import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(userId: number = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "test-coupon-user",
    email: "coupon@test.com",
    name: "Coupon Test User",
    loginMethod: "manus",
    role: "user",
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

describe("Coupon System", () => {

  it("should validate a valid coupon code", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.coupon.validate({ code: "FOREVER_FREE" });

    expect(result.valid).toBe(true);
    expect(result.coupon).toBeDefined();
    expect(result.coupon?.code).toBe("FOREVER_FREE");
    expect(result.coupon?.type).toBe("forever_free");
  });

  it("should reject an invalid coupon code", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.coupon.validate({ code: "INVALID_CODE" });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should validate TRIAL_30 coupon", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.coupon.validate({ code: "TRIAL_30" });

    expect(result.valid).toBe(true);
    expect(result.coupon).toBeDefined();
    expect(result.coupon?.code).toBe("TRIAL_30");
    expect(result.coupon?.type).toBe("trial_30");
  });

  it("should validate TRIAL_14 coupon", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.coupon.validate({ code: "TRIAL_14" });

    expect(result.valid).toBe(true);
    expect(result.coupon).toBeDefined();
    expect(result.coupon?.code).toBe("TRIAL_14");
    expect(result.coupon?.type).toBe("trial_14");
  });

  it("should require authentication for coupon operations", async () => {
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
    await expect(caller.coupon.validate({ code: "FOREVER_FREE" })).rejects.toThrow();
  });
});

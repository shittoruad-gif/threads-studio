import { eq, and, isNull, gt, lt } from "drizzle-orm";
import { getDb } from "./db";
import { coupons, userCoupons, subscriptions, type Coupon, type InsertCoupon, type InsertUserCoupon } from "../drizzle/schema";

/**
 * Validate and retrieve a coupon by code
 */
export async function validateCoupon(code: string): Promise<{ valid: boolean; coupon?: Coupon; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { valid: false, error: "Database not available" };
  }

  const result = await db
    .select()
    .from(coupons)
    .where(eq(coupons.code, code.toUpperCase()))
    .limit(1);

  if (result.length === 0) {
    return { valid: false, error: "クーポンコードが見つかりません" };
  }

  const coupon = result[0];

  // Check if coupon is active
  if (!coupon!.isActive) {
    return { valid: false, error: "このクーポンは無効です" };
  }

  // Check if coupon has expired
  if (coupon!.expiresAt && new Date(coupon!.expiresAt) < new Date()) {
    return { valid: false, error: "このクーポンは期限切れです" };
  }

  // Check if coupon has reached max uses
  if (coupon!.maxUses !== null && coupon!.usedCount >= coupon!.maxUses) {
    return { valid: false, error: "このクーポンは使用上限に達しています" };
  }

  return { valid: true, coupon: coupon! };
}

/**
 * Check if a user has already used a coupon
 */
export async function hasUserUsedCoupon(userId: number, couponId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    return false;
  }

  const result = await db
    .select()
    .from(userCoupons)
    .where(and(eq(userCoupons.userId, userId), eq(userCoupons.couponId, couponId)))
    .limit(1);

  return result.length > 0;
}

/**
 * Apply a coupon to a user's subscription
 */
export async function applyCoupon(
  userId: number,
  couponCode: string
): Promise<{ success: boolean; message: string; trialEndsAt?: Date }> {
  const db = await getDb();
  if (!db) {
    return { success: false, message: "Database not available" };
  }

  // Validate coupon
  const validation = await validateCoupon(couponCode);
  if (!validation.valid || !validation.coupon) {
    return { success: false, message: validation.error || "Invalid coupon" };
  }

  const coupon = validation.coupon;

  // Check if user has already used this coupon
  const alreadyUsed = await hasUserUsedCoupon(userId, coupon.id);
  if (alreadyUsed) {
    return { success: false, message: "このクーポンは既に使用されています" };
  }

  // Calculate trial end date based on coupon type
  let trialEndsAt: Date | null = null;
  let planId = "pro"; // Default to pro plan for trials

  switch (coupon.type) {
    case "forever_free":
      // Forever free = no trial end date
      trialEndsAt = null;
      planId = "pro"; // Give pro plan features
      break;
    case "trial_30":
      trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 30);
      break;
    case "trial_14":
      trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);
      break;
  }

  // Get or create user's subscription
  const existingSubscription = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (existingSubscription.length > 0) {
    // Update existing subscription
    await db
      .update(subscriptions)
      .set({
        planId,
        trialEndsAt,
        status: "trialing",
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, existingSubscription[0]!.id));
  } else {
    // Create new subscription
    await db.insert(subscriptions).values({
      userId,
      planId,
      trialEndsAt,
      status: "trialing",
      stripeSubscriptionId: null,
      currentPeriodEnd: trialEndsAt,
      cancelAtPeriodEnd: false,
    });
  }

  // Record coupon usage
  await db.insert(userCoupons).values({
    userId,
    couponId: coupon.id,
  });

  // Increment coupon used count
  await db
    .update(coupons)
    .set({
      usedCount: coupon.usedCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(coupons.id, coupon.id));

  let message = "";
  if (coupon.type === "forever_free") {
    message = "永久無料プランが適用されました！";
  } else if (coupon.type === "trial_30") {
    message = "30日間無料トライアルが開始されました！";
  } else {
    message = "14日間無料トライアルが開始されました！";
  }

  return { success: true, message, trialEndsAt: trialEndsAt || undefined };
}

/**
 * Create initial coupon codes
 */
export async function seedCoupons() {
  const db = await getDb();
  if (!db) {
    console.warn("[Coupon] Cannot seed coupons: database not available");
    return;
  }

  const couponData: InsertCoupon[] = [
    {
      code: "FOREVER_FREE",
      type: "forever_free",
      description: "永久無料プラン（プロプラン相当）",
      maxUses: null, // Unlimited
      isActive: true,
    },
    {
      code: "TRIAL_30",
      type: "trial_30",
      description: "30日間無料トライアル",
      maxUses: null,
      isActive: true,
    },
    {
      code: "TRIAL_14",
      type: "trial_14",
      description: "14日間無料トライアル",
      maxUses: null,
      isActive: true,
    },
  ];

  for (const coupon of couponData) {
    try {
      // Check if coupon already exists
      const existing = await db.select().from(coupons).where(eq(coupons.code, coupon.code)).limit(1);
      
      if (existing.length === 0) {
        await db.insert(coupons).values(coupon);
        console.log(`[Coupon] Created coupon: ${coupon.code}`);
      }
    } catch (error) {
      console.error(`[Coupon] Failed to create coupon ${coupon.code}:`, error);
    }
  }
}

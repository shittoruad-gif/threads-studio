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
      // Forever free = no trial end date, permanent pro access
      trialEndsAt = null;
      planId = "pro";
      break;
    case "trial_30":
      trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 30);
      break;
    case "trial_14":
      trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);
      break;
    case "discount_50":
      // 50% off - give pro plan with 90-day trial
      trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 90);
      planId = "pro";
      break;
    case "discount_30":
      // 30% off - give pro plan with 60-day trial
      trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 60);
      planId = "pro";
      break;
    case "special_price":
      // Special price - give pro plan with 180-day trial
      trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 180);
      planId = "pro";
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
  switch (coupon.type) {
    case "forever_free":
      message = "永久無料プランが適用されました！全機能を無制限でご利用いただけます。";
      break;
    case "trial_30":
      message = "30日間無料トライアルが開始されました！";
      break;
    case "trial_14":
      message = "14日間無料トライアルが開始されました！";
      break;
    case "discount_50":
      message = "50%OFFクーポンが適用されました！90日間プロプランをご利用いただけます。";
      break;
    case "discount_30":
      message = "30%OFFクーポンが適用されました！60日間プロプランをご利用いただけます。";
      break;
    case "special_price":
      message = "特別価格クーポンが適用されました！180日間プロプランをご利用いただけます。";
      break;
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
    // 永久無料（管理者・特別パートナー用）
    {
      code: "PROST2026",
      type: "forever_free",
      description: "永久無料プラン - 全機能無制限",
      maxUses: 10,
      isActive: true,
    },
    {
      code: "VIP-MEMBER",
      type: "forever_free",
      description: "VIPメンバー永久無料プラン",
      maxUses: 5,
      isActive: true,
    },
    // 特別価格（180日間プロプラン）
    {
      code: "LAUNCH2026",
      type: "special_price",
      description: "ローンチ記念特別価格 - 180日間プロプラン無料",
      maxUses: 50,
      isActive: true,
    },
    // 50%OFF（90日間プロプラン）
    {
      code: "HALF-OFF",
      type: "discount_50",
      description: "50%OFFクーポン - 90日間プロプラン無料",
      maxUses: 100,
      isActive: true,
    },
    {
      code: "SEMINAR50",
      type: "discount_50",
      description: "セミナー参加者限定50%OFF",
      maxUses: null,
      isActive: true,
    },
    // 30%OFF（60日間プロプラン）
    {
      code: "FRIEND30",
      type: "discount_30",
      description: "お友達紹介30%OFF - 60日間プロプラン無料",
      maxUses: null,
      isActive: true,
    },
    // 30日無料トライアル
    {
      code: "WELCOME",
      type: "trial_30",
      description: "ウェルカム30日間無料トライアル",
      maxUses: null,
      isActive: true,
    },
    {
      code: "START30",
      type: "trial_30",
      description: "スタート応援30日間無料トライアル",
      maxUses: null,
      isActive: true,
    },
    // 14日無料トライアル
    {
      code: "TRIAL",
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

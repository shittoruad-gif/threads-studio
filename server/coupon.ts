import { desc, eq, and, isNull, gt, lt } from "drizzle-orm";
import { getDb } from "./db";
import { coupons, userCoupons, subscriptions, type Coupon, type InsertCoupon, type InsertUserCoupon } from "../drizzle/schema";
import { normalizeCouponCode } from "@shared/inputNormalize";

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
    .where(eq(coupons.code, normalizeCouponCode(code)))
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
/** その方がすでに使ったコード（どれか1つ）。使っていなければ null（2026-10-04 お一人さま1回） */
export async function usedCouponCodeOf(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ code: coupons.code })
    .from(userCoupons)
    .innerJoin(coupons, eq(coupons.id, userCoupons.couponId))
    .where(eq(userCoupons.userId, userId))
    .limit(1);
  return rows[0]?.code ?? null;
}

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

// セミナー価格コードの一覧と種別判定は @shared/plans に移設
// （管理画面のクーポン効果表示でも使うため。営業マン追加時は shared/plans.ts と DB の両方に足す）。
import { campaignTierForCode, effectiveSubscriptionStatus } from "@shared/plans";
export { campaignTierForCode };

/**
 * Apply a coupon to a user's subscription
 */
export async function applyCoupon(
  userId: number,
  couponCode: string
): Promise<{ success: boolean; message: string; trialEndsAt?: Date; code?: string }> {
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
    // モニター系コードは冪等に扱う。再入力しても「エラー」ではなく、
    // キャンペーン価格（campaignTier）を確実に立て直して成功として返す。
    // ★isMonitor（モニター中）は既定で立てない（2026-09-07 三上様指示）。料金は campaignTier で決まる。
    if (coupon.type === "monitor" || coupon.type === "monitor_only") {
      try {
        const { users } = await import("../drizzle/schema");
        const db2 = await getDb();
        if (db2) {
          await db2.update(users).set({ campaignTier: campaignTierForCode(coupon.code) }).where(eq(users.id, userId));
        }
      } catch (e) {
        console.error("[Coupon] monitor re-apply isMonitor set failed:", e);
      }
      return { success: true, message: "モニター登録は既に有効です。ダッシュボード右下のボタンからフィードバックを送信いただけます。", code: coupon.code };
    }
    return { success: false, message: "このクーポンは既に使用されています" };
  }

  // ★クーポン・紹介コードは、種類を問わずお一人さま1回まで（2026-10-04 三上様「全ユーザ、クーポンコードが使えるのは一度切り」）。
  //   別のコードをすでに使っている方には、新しいコードを適用しない（同じコードの再入力は上で扱う）。
  const usedOther = await usedCouponCodeOf(userId);
  if (usedOther) {
    return { success: false, message: `クーポン・紹介コードは、お一人さま1回までです（すでに「${usedOther}」をお使いです）。ご不明な点は公式LINEの「担当者に聞く」からお知らせください。` };
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
    case "monitor":
      // Monitor program - 90 days pro plan + monitor status
      trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 90);
      planId = "pro";
      break;
  }

  // monitor_only クーポンはプラン（サブスク）を一切変更しない。
  // モニターフラグだけを立てるため、キャンペーン価格の課金はそのまま維持される。
  if (coupon.type !== "monitor_only") {
    // Get or create user's subscription
    const existingSubscription = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    // ★解約ずみ（または解約の予約の期限を過ぎた）契約には上書きせず、新しい契約の行を作る（2026-10-04 点検）。
    //   上書きすると「解約の予約」の印と過去の期限が残り、effectiveSubscriptionStatus がすぐに canceled と判定して
    //   クーポンが使えなかった。古い行（UnivaPayの契約ID）は、遅れて届く通知の照合のためそのまま残す。
    const latest = existingSubscription[0];
    const latestEnded = !!latest && effectiveSubscriptionStatus(latest as any) === "canceled";
    // ★有料のご契約中（UnivaPayの契約あり・解約予約の期間内を含む）にクーポンで上書きすると、
    //   毎朝の照合がUnivaPay側の状態で書き戻し、残りの期間まで失うことがある（2026-10-04 点検）。ここでは受け付けない。
    const latestPaidLive = !!latest && !latestEnded && !!(latest as any).univapaySubscriptionId
      && ((latest as any).status === "active" || (latest as any).status === "trialing" || (latest as any).status === "past_due");
    if (latestPaidLive) {
      return { success: false, message: "有料のご契約中のため、このクーポンは使えません。プランのご相談は公式LINEの「担当者に聞く」からお知らせください。" };
    }
    if (latest && !latestEnded) {
      // Update existing subscription
      await db
        .update(subscriptions)
        .set({
          planId,
          trialEndsAt,
          status: "trialing",
          // 解約の予約は取り消し、使える期間はクーポンの終わりにそろえる
          cancelAtPeriodEnd: false,
          currentPeriodEnd: trialEndsAt,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, latest.id));
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
  }

  // 無料トライアルが始まった瞬間に、今日の分の投稿を作る（朝6時を待たない）。
  // Threads未連携・お店の情報が未登録なら中で何もしない。
  import("./autoPostScheduler")
    .then(({ runAutoPostCatchUpForUser }) => runAutoPostCatchUpForUser(userId, "無料トライアル開始"))
    .catch(() => {});

  // monitor / monitor_only クーポンはキャンペーン価格（campaignTier）だけを設定する。
  // ★「モニター中」フラグ（isMonitor＝フィードバック募集の対象）は既定で立てない（2026-09-07 三上様指示）。
  //   必要なときだけ管理画面の「モニターにする」で明示的にONにする。
  if (coupon.type === "monitor" || coupon.type === "monitor_only") {
    const { users } = await import("../drizzle/schema");
    await db
      .update(users)
      .set({ campaignTier: campaignTierForCode(coupon.code) })
      .where(eq(users.id, userId));
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
      message = "プロプランを期限なし・無料でお使いいただけるようになりました。全機能をご利用いただけます。";
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
    case "monitor":
      message = "モニタープログラムへようこそ！90日間プロプランを無料でご利用いただけます。フィードバック機能が有効になりました。";
      break;
    case "monitor_only":
      message = "モニター登録が完了しました！ダッシュボード右下のボタンからフィードバックを送信いただけます。ご協力をお願いいたします。";
      break;
  }

  return { success: true, message, trialEndsAt: trialEndsAt || undefined, code: coupon.code };
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
      description: "プロプラン（期限なし・無料）- 全機能",
      maxUses: 10,
      isActive: true,
    },
    {
      code: "VIP-MEMBER",
      type: "forever_free",
      description: "VIPメンバー プロプラン（期限なし・無料）",
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
    // キャンペーンモニター（モニター化＋キャンペーン価格表示・料金変更なし）
    // 入力したユーザーは isMonitor=true になり、料金ページでキャンペーン価格が表示される。
    // 配布先別に複数コードを用意（経路分析用）。挙動はすべて同じ。
    {
      code: "SEIKOTSU2026",
      type: "monitor_only",
      description: "整骨院クライアント様向けキャンペーン（モニター化＋キャンペーン価格）",
      maxUses: 30,
      isActive: true,
    },
    {
      code: "SEMINAR2026",
      type: "monitor_only",
      description: "セミナー参加者様向けキャンペーン（モニター化＋キャンペーン価格）",
      maxUses: 30,
      isActive: true,
    },
    {
      code: "PARTNER2026",
      type: "monitor_only",
      description: "紹介・パートナー様向けキャンペーン（モニター化＋キャンペーン価格）",
      maxUses: 30,
      isActive: true,
    },
    {
      code: "CPMONITOR2026",
      type: "monitor_only",
      description: "モニター指定キャンペーン（モニター化＋キャンペーン価格）",
      maxUses: 30,
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

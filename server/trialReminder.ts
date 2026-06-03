import cron from "node-cron";
import { withDbRetry, getUserById } from "./db";
import { subscriptions } from "../drizzle/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { notifyOwner, sendEmail } from "./_core/notification";
import { getPlan } from "../shared/plans";

/**
 * Check for trials ending soon and send reminders
 */
async function checkTrialReminders() {
  const now = new Date();
  
  // 3日後の日時
  const threeDaysFromNow = new Date(now);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  threeDaysFromNow.setHours(23, 59, 59, 999);
  
  // 1日後の日時
  const oneDayFromNow = new Date(now);
  oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);
  oneDayFromNow.setHours(23, 59, 59, 999);

  try {
    // トライアル中のサブスクリプションを取得（リトライ付き）
    const trialingSubscriptions = await withDbRetry((db) =>
      db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.status, "trialing"),
            isNotNull(subscriptions.trialEndsAt)
          )
        )
    );

    for (const sub of trialingSubscriptions) {
      if (!sub.trialEndsAt) continue;

      const trialEndDate = new Date(sub.trialEndsAt);
      const hoursRemaining = (trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      const daysRemaining = Math.ceil(hoursRemaining / 24);

      // 3日前の通知（48〜72時間）
      if (daysRemaining === 3) {
        await sendTrialReminder(sub.userId, sub.planId, trialEndDate, 3);
        console.log(`[TrialReminder] Sent 3-day reminder to user ${sub.userId}`);
      }

      // 1日前の通知（0〜24時間）
      else if (daysRemaining === 1) {
        await sendTrialReminder(sub.userId, sub.planId, trialEndDate, 1);
        console.log(`[TrialReminder] Sent 1-day reminder to user ${sub.userId}`);
      }

      // 当日の通知（トライアル終了 = 0時間以下）
      else if (hoursRemaining <= 0) {
        await sendTrialEndingToday(sub.userId, sub.planId, trialEndDate);
        console.log(`[TrialReminder] Sent trial ending today notification to user ${sub.userId}`);
      }
    }
  } catch (error) {
    console.error("[TrialReminder] Error checking trial reminders:", error);
  }
}

/**
 * Send trial reminder notification
 */
async function sendTrialReminder(
  userId: number,
  planId: string,
  trialEndDate: Date,
  daysRemaining: number
) {
  const formattedDate = trialEndDate.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const plan = getPlan(planId);
  const planName = plan?.name ?? 'プラン';
  const priceText = plan ? `月¥${plan.priceMonthly.toLocaleString()}` : '';
  const base = process.env.APP_BASE_URL || 'https://threads-studio.com';

  try {
    const user = await getUserById(userId);
    if (user?.email) {
      await sendEmail({
        to: user.email,
        subject: `【Threads Studio】無料トライアル終了まであと${daysRemaining}日`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2>無料トライアル終了まであと${daysRemaining}日です</h2>
          <p>${planName}（${priceText}）の無料トライアルが <strong>${formattedDate}</strong> に終了します。</p>
          <p>そのまま継続される場合は、トライアル終了後に登録済みのカードへ自動でお支払いが発生します（お手続き不要）。</p>
          <p>継続をご希望でない場合は、トライアル終了日までにダッシュボードから解約してください。期間内の解約であれば料金は一切発生しません。</p>
          <a href="${base}/dashboard" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">ダッシュボードを開く</a>
        </div>`,
      });
    }
  } catch (error) {
    console.error(`[TrialReminder] Failed to send reminder for user ${userId}:`, error);
  }
}

/**
 * Send trial ending today notification
 */
async function sendTrialEndingToday(
  userId: number,
  planId: string,
  trialEndDate: Date
) {
  const formattedDate = trialEndDate.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const plan = getPlan(planId);
  const planName = plan?.name ?? 'プラン';
  const priceText = plan ? `月¥${plan.priceMonthly.toLocaleString()}` : '';
  const base = process.env.APP_BASE_URL || 'https://threads-studio.com';

  try {
    const user = await getUserById(userId);
    if (user?.email) {
      await sendEmail({
        to: user.email,
        subject: `【Threads Studio】本日、無料トライアルが終了します`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2>本日、無料トライアルが終了します</h2>
          <p>${planName}（${priceText}）の無料トライアルが本日（${formattedDate}）で終了します。</p>
          <p>継続される場合は、登録済みのカードへ自動でお支払いが発生します（お手続き不要）。</p>
          <p>継続をご希望でない場合は、本日中にダッシュボードから解約してください。</p>
          <a href="${base}/dashboard" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">ダッシュボードを開く</a>
        </div>`,
      });
    }
  } catch (error) {
    console.error(`[TrialReminder] Failed to send ending notification for user ${userId}:`, error);
  }
}

/**
 * Initialize trial reminder scheduler
 * Runs daily at 9:00 AM
 */
export function initTrialReminderScheduler() {
  // 毎日午前9時に実行
  cron.schedule("0 9 * * *", async () => {
    console.log("[TrialReminder] Running daily trial reminder check...");
    await checkTrialReminders();
  });

  console.log("[TrialReminder] Scheduler initialized - will check daily at 9:00 AM");
}

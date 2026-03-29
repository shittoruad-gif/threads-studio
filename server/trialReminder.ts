import cron from "node-cron";
import { withDbRetry } from "./db";
import { subscriptions } from "../drizzle/schema";
import { eq, and, isNotNull, lt, gt } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

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

  const title = `トライアル終了まであと${daysRemaining}日`;
  const content = `
ユーザーID: ${userId}
プラン: ${planId}
トライアル終了日: ${formattedDate}

トライアル期間があと${daysRemaining}日で終了します。
継続してご利用いただく場合は、料金プランをご選択ください。
  `.trim();

  try {
    await notifyOwner({ title, content });
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
    hour: '2-digit',
    minute: '2-digit',
  });

  const title = `トライアル終了日（本日）`;
  const content = `
ユーザーID: ${userId}
プラン: ${planId}
トライアル終了日時: ${formattedDate}

トライアル期間が本日終了します。
継続してご利用いただく場合は、料金プランをご選択ください。
  `.trim();

  try {
    await notifyOwner({ title, content });
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

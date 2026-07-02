import cron from "node-cron";
import {
  getSubscriptionsWithPaymentIssues,
  updateSubscription,
  getUserById,
} from "./db";
import {
  sendPaymentFailedEmail,
  sendSubscriptionStoppedEmail,
  notifyOwner,
} from "./_core/notification";
import { getPlan } from "../shared/plans";

/**
 * カード決済失敗フォローアップ（dunning）
 *
 * Univapay の Webhook で past_due になった契約に対し、毎日チェックして
 *   ① 猶予期間内 → 数日おきにカード再登録の督促メールを自動送信
 *   ② 猶予期間（GRACE_DAYS）を過ぎても未解決 → 有料プランを自動停止（フリーへ）
 * を行う。顧客へのメールに加え、運営（スタッフ）へも通知して
 * 電話/LINE での人的フォローにつなげる。
 *
 * 課金が成功すると Webhook 側で failedPaymentCount=0・各日時=null に
 * リセットされ、past_due も解消されるため、本ジョブの対象から自然に外れる。
 */

// 初回失敗からこの日数を過ぎても未解決なら自動停止する猶予期間。
const GRACE_DAYS = 7;
// 督促メールの再送間隔（日）。日次cronの多重送信を防ぐ。
const REMINDER_INTERVAL_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(date: Date | null | undefined, now: Date): number {
  if (!date) return 0;
  return Math.floor((now.getTime() - new Date(date).getTime()) / DAY_MS);
}

export async function runPaymentFollowUp(now: Date = new Date()): Promise<void> {
  let subs;
  try {
    subs = await getSubscriptionsWithPaymentIssues();
  } catch (e) {
    console.error("[PaymentFollowUp] 対象取得エラー:", e);
    return;
  }

  for (const sub of subs) {
    // incomplete（登録途中）は督促対象外。実際に失敗した past_due / unpaid のみ。
    if (sub.status !== "past_due" && sub.status !== "unpaid") continue;

    try {
      const user = await getUserById(sub.userId);
      if (!user?.email) continue;

      const plan = getPlan(sub.planId);
      const planName = plan?.name ?? "プラン";
      const reRegisterUrl = plan?.univapayLinkUrl ?? null;

      // 猶予期間の起点。万一 firstFailedPaymentAt が無ければ直近失敗日→更新日で代替。
      const startedAt = sub.firstFailedPaymentAt ?? sub.lastFailedPaymentAt ?? sub.updatedAt;
      const elapsed = daysSince(startedAt, now);

      // ── ① 猶予超過 → 自動停止 ────────────────────────────────
      if (elapsed >= GRACE_DAYS) {
        // Univapay 側の定期課金も止めてリトライ嵐を防ぐ。
        if (sub.univapaySubscriptionId) {
          try {
            const univapay = await import("./univapay");
            await univapay.cancelSubscription(sub.univapaySubscriptionId);
          } catch (e) {
            console.error(`[PaymentFollowUp] Univapay解約失敗 user=${sub.userId}:`, e);
          }
        }
        await updateSubscription(sub.id, {
          status: "canceled",
          cancelAtPeriodEnd: false,
        });
        try {
          await sendSubscriptionStoppedEmail(user.email, planName, reRegisterUrl);
        } catch (e) {
          console.error(`[PaymentFollowUp] 停止メール失敗 user=${sub.userId}:`, e);
        }
        await notifyOwner({
          title: `🛑 自動停止: ${user.name ?? user.email}（決済未完了 ${elapsed}日）`,
          content:
            `顧客: ${user.name ?? "(名前未設定)"} <${user.email}>\n` +
            `プラン: ${planName}（${sub.planId}）→ フリーへ\n` +
            `連続失敗: ${sub.failedPaymentCount}回 / 初回失敗から${elapsed}日経過\n` +
            `→ 有料プランを自動停止しました。Univapayの定期課金も解約済み（IDがある場合）。`,
        });
        console.log(`[PaymentFollowUp] 自動停止: user=${sub.userId} plan=${sub.planId} (${elapsed}日)`);
        continue;
      }

      // ── ② 猶予内 → 一定間隔で督促メール ──────────────────────
      const sinceLastReminder = daysSince(sub.lastDunningReminderAt, now);
      const shouldRemind =
        !sub.lastDunningReminderAt || sinceLastReminder >= REMINDER_INTERVAL_DAYS;
      if (!shouldRemind) continue;

      // 経過日数が長いほどトーンを強める（停止が近いほど緊急度を上げる）。
      const attemptForTone = Math.max(sub.failedPaymentCount, elapsed >= 5 ? 3 : elapsed >= 3 ? 2 : 1);
      try {
        await sendPaymentFailedEmail(user.email, planName, plan?.priceMonthly ?? null, attemptForTone, null, reRegisterUrl);
        await updateSubscription(sub.id, { lastDunningReminderAt: now });
        console.log(`[PaymentFollowUp] 督促メール送信: user=${sub.userId} 経過${elapsed}日 tone=${attemptForTone}`);
      } catch (e) {
        console.error(`[PaymentFollowUp] 督促メール失敗 user=${sub.userId}:`, e);
      }
    } catch (e) {
      console.error(`[PaymentFollowUp] 処理エラー sub=${sub.id}:`, e);
    }
  }
}

/**
 * 決済失敗フォローアップのスケジューラ初期化。毎日 9:30 に実行
 * （トライアル通知の 9:00 と時間をずらす）。
 */
export function initPaymentFollowUpScheduler(): void {
  cron.schedule("30 9 * * *", async () => {
    console.log("[PaymentFollowUp] 日次の決済失敗フォローを実行...");
    const { runTrackedJob } = await import("./jobRunner");
    await runTrackedJob("payment_follow_up", () => runPaymentFollowUp());
  });
  console.log("[PaymentFollowUp] Scheduler initialized - runs daily at 9:30 AM");
}

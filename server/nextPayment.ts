/**
 * 次回の決済日と金額（2026-09-25 三上様指示「次回の決済日がいつなのかも、全てわかるように」）。
 *
 * ★正は UnivaPay の next_payment（due_date は Asia/Tokyo の日付）。
 *   subscriptions.currentPeriodEnd は「支払った日時＋1か月＋α」で入っており、実測で
 *   お支払いのある12名全員が UnivaPay の次回決済日より**ちょうど1日遅い**（例：香取様 DB 10/3・UnivaPay 10/2）。
 *   画面・LINE・自動応答で「次回の決済日」を出すときは、必ずここを通す。
 *   currentPeriodEnd は「ご利用いただける期限」の判定に使われているので、値そのものは変えない。
 */
import * as db from "./db";

export interface NextPayment {
  /** 次回の決済日（JST・YYYY-MM-DD） */
  dueDate: string;
  /** 次回の金額（円・税込）。プラン変更の予約があれば変更後の金額 */
  amount: number | null;
}

const cache = new Map<string, { at: number; value: NextPayment | null }>();
const TTL_MS = 30 * 60_000;

/** UnivaPay の定期課金IDから次回の決済を読む（読めなければ null・推測で埋めない） */
export async function nextPaymentForSubscriptionId(subscriptionId: string): Promise<NextPayment | null> {
  const hit = cache.get(subscriptionId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value: NextPayment | null = null;
  try {
    const { getSubscription } = await import("./univapay");
    const s: any = await getSubscription(subscriptionId);
    const np = s?.next_payment;
    const due = typeof np?.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(np.due_date) ? np.due_date : null;
    // 解約・停止した定期課金には次回が無い
    const alive = !s?.status || ["current", "unverified", "unpaid"].includes(String(s.status));
    if (due && alive) value = { dueDate: due, amount: typeof np?.amount === "number" ? np.amount : null };
  } catch {
    value = null;
  }
  cache.set(subscriptionId, { at: Date.now(), value });
  return value;
}

/** そのお客様の次回の決済（解約予定・お試し・未契約なら null） */
export async function nextPaymentForUser(userId: number): Promise<NextPayment | null> {
  const sub: any = await db.getSubscriptionByUserId(userId).catch(() => null);
  if (!sub?.univapaySubscriptionId) return null;
  if (sub.cancelAtPeriodEnd || sub.status === "canceled") return null;
  return nextPaymentForSubscriptionId(String(sub.univapaySubscriptionId));
}


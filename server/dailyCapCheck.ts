/**
 * 公開時の「今日の上限」判定（2026-09-13 三上様決定 R1）。
 * 契約本数（プラン上限で頭打ち）→ 慣らし／冷却／補填（rampForAccount）→ 自動の繰り越し（carry）を合わせて、
 * shared/dailyCap.ts の computeDailyCap で1日の本数を決める。
 */
import * as db from "./db";
import { rampForAccount } from "./accountRampCheck";
import { maxExtraPerDayFor, jstDateString, dateColToJst, inCooldown } from "../shared/accountRamp";
import { computeDailyCap } from "../shared/dailyCap";

export interface DailyCapDecision {
  cap: number;
  contract: number;
  reason: "cooldown" | "ramp" | "contract";
  /** 慣らし・冷却＝Threads の実測（ご本人の手動投稿を含む）で数える */
  strict: boolean;
  days: number;
  untilJst: string;
  note: string;
}

function postCountOf(frequency: string): number {
  switch (frequency) {
    case "three_daily": return 3;
    case "twice_daily": return 2;
    case "daily":
    default: return 1;
  }
}

export async function dailyCapDecision(account: any, userId: number): Promise<DailyCapDecision> {
  const subscription: any = await db.getSubscriptionByUserId(userId).catch(() => null);
  const { getPlan, resolveEffectivePlanId } = await import("../shared/plans");
  const plan: any = getPlan(resolveEffectivePlanId(subscription?.planId, subscription?.status));
  const maxPerDay = Number(plan?.features?.maxAutoPostsPerDay ?? 0);
  // 共通設定は users 行（autoPostScheduler と同じ）、アカウント別の上書きを合成する
  const user: any = await db.getUserById(userId).catch(() => null);
  const { effectiveAccountSettings } = await import("../shared/accountSettings");
  const eff: any = effectiveAccountSettings(user as any, account as any);
  const contract = Math.max(1, Math.min(postCountOf(String(eff?.autoPostFrequency ?? "daily")), maxPerDay > 0 ? maxPerDay : 1));
  const rc = await rampForAccount(account, contract);
  const today = jstDateString(0);
  const carry = dateColToJst(account?.carryDate) === today ? Number(account?.carryCount ?? 0) : 0;
  // ★学習用アカウントの上乗せ分は、上限の天井にも足す（shared/learningAccounts.ts・自社2店だけ）
  const cap = computeDailyCap({ contract, rampCount: rc.count, rampCapped: rc.capped, carry, maxExtra: maxExtraPerDayFor(account) + Number(rc.learning ?? 0) });
  const reason: DailyCapDecision["reason"] = inCooldown(account) ? "cooldown" : rc.capped ? "ramp" : "contract";
  return { cap, contract, reason, strict: rc.capped, days: rc.days, untilJst: dateColToJst(account?.cooldownUntil), note: rc.note };
}

/** 「明日に回しました」を送った日（アカウントごと・1日1通）。公開時の判定（scheduledPostExecutor）と共有する */
export const capNoticeSentOn = new Map<number, string>();

/** 今日Threadsに出ている数（ご本人がThreadsアプリから直接出した分を含む・実測） */
export async function threadsPostsTodayCount(accessToken: string, threadsUserId: string): Promise<number> {
  const { getThreadsUserPosts } = await import("./threadsApi");
  const recent = await getThreadsUserPosts(accessToken, threadsUserId, 25);
  const today = jstDateString(0);
  return (recent || []).filter((p: any) => jstDateString(0, new Date(p.timestamp).getTime()) === today).length;
}

/**
 * 明日へ回したことを、やさしい言葉で1日1通だけ伝える（2026-11-01）。
 * 直接の投稿の数＝Threadsの実測 − 今日こちらから出した数。
 */
export async function sendDeferredNotice(
  account: any,
  userId: number,
  dc: DailyCapDecision,
  todayCount: number,
  moved: Array<{ head: string; from: Date | string; to: Date | string }>,
): Promise<void> {
  const today = jstDateString(0);
  if (!dc.strict || moved.length === 0 || capNoticeSentOn.get(account.id) === today) return;
  capNoticeSentOn.set(account.id, today);
  try {
    const ours = await db.countAccountPostsPublishedToday(account.id).catch(() => 0);
    const { deferredNoticeText } = await import("../shared/approvalLead");
    const { dateJstLabel } = await import("../shared/dailyCap");
    const text = deferredNoticeText({
      username: String(account.threadsUsername),
      reason: dc.reason === "cooldown" ? "cooldown" : "ramp",
      cap: dc.cap,
      todayCount,
      direct: Math.max(0, todayCount - ours),
      untilLabel: dc.reason === "cooldown" ? dateJstLabel(dc.untilJst) : undefined,
      moved,
    });
    const targets = await db.getLineUserIdsForUser(userId);
    const { pushMessages } = await import("./lineNotify");
    for (const to of targets) await pushMessages(to, [{ type: "text", text }]);
  } catch (e) { console.warn(`[DailyCap] 明日に回したお知らせに失敗 account=${account.id}: ${(e as Error)?.message}`); }
}

/**
 * 今日の数に届いていたら、今日の残りの自動投稿を「その場で」明日の同じ時刻へ回す（2026-11-01）。
 *
 * 以前は公開の直前にだけ回していた。そのあいだ画面とLINEには「今日21:13」と出たまま、
 * 夜の「明日の分」づくりはまだ今日にある投稿を数えずに明日の分を作り、明日が契約より多くなっていた
 * （11/1 慣らし中のお客様：ご本人の直接投稿3件 → 21:13の投稿が残ったまま、20:34に明日の分を作成）。
 * 慣らし・冷却中（Threadsの実測で数えるアカウント）だけが対象。歴の長いアカウントは公開時の判定のまま。
 */
export async function deferOverCapToday(accountId: number): Promise<number> {
  const account: any = await db.getThreadsAccountById(accountId);
  if (!account?.accessToken || !account?.threadsUserId || !account?.userId) return 0;
  const dc = await dailyCapDecision(account, Number(account.userId));
  if (!dc.strict) return 0;
  const rows = await db.listTodaysRemainingAutoPosts(accountId);
  if (rows.length === 0) return 0;
  const todayCount = await threadsPostsTodayCount(account.accessToken, account.threadsUserId);
  if (todayCount < dc.cap) return 0;
  const { nextDaySameTime } = await import("../shared/dailyCap");
  const moved: Array<{ head: string; from: Date | string; to: Date | string }> = [];
  for (const r of rows) {
    const at = nextDaySameTime(r.scheduledAt, Date.now());
    await db.moveScheduledPostToDay(r.id, at, jstDateString(0, at.getTime()));
    moved.push({ head: String(r.postContent ?? ""), from: r.scheduledAt, to: at });
    console.log(`[DailyCap] 先に明日へ (${dc.reason}): account ${accountId} today=${todayCount} cap=${dc.cap} → post ${r.id}`);
  }
  await sendDeferredNotice(account, Number(account.userId), dc, todayCount, moved);
  return moved.length;
}

/**
 * 公開時の「今日の上限」判定（2026-09-13 三上様決定 R1）。
 * 契約本数（プラン上限で頭打ち）→ 慣らし／冷却／補填（rampForAccount）→ 自動の繰り越し（carry）を合わせて、
 * shared/dailyCap.ts の computeDailyCap で1日の本数を決める。
 */
import * as db from "./db";
import { rampForAccount } from "./accountRampCheck";
import { MAX_EXTRA_PER_DAY, jstDateString, dateColToJst, inCooldown } from "../shared/accountRamp";
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
  const cap = computeDailyCap({ contract, rampCount: rc.count, rampCapped: rc.capped, carry, maxExtra: MAX_EXTRA_PER_DAY });
  const reason: DailyCapDecision["reason"] = inCooldown(account) ? "cooldown" : rc.capped ? "ramp" : "contract";
  return { cap, contract, reason, strict: rc.capped, days: rc.days, untilJst: dateColToJst(account?.cooldownUntil), note: rc.note };
}

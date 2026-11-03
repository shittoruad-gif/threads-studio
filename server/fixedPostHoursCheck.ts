/**
 * 決めておいた時刻（threadsAccounts.fixedPostHours・shared/fixedPostHours.ts）を、翌日へ回す処理でも守る。
 * 決めていないアカウントは nextDaySameTime（今まで通り）をそのまま返し、DB も読まない。
 */
import * as db from "./db";
import { nextDaySameTime } from "../shared/dailyCap";
import { OCCUPIED_GAP_MINUTES, parseFixedPostHours, deferredTimeForFixedHours } from "../shared/fixedPostHours";

export async function deferredPostTime(
  account: { id: number; fixedPostHours?: string | null } | null | undefined,
  scheduledAt: Date | string | number,
  postId: number | null,
  now: number = Date.now(),
): Promise<Date> {
  const base = nextDaySameTime(scheduledAt, now);
  const hours = parseFixedPostHours((account as any)?.fixedPostHours);
  if (!account || !hours) return base;
  try {
    const ymd = new Date(base.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const occupied = await db.getAccountSlotTimesOnDate(Number(account.id), ymd, postId);
    return deferredTimeForFixedHours(base, hours, occupied, OCCUPIED_GAP_MINUTES);
  } catch {
    return base;
  }
}

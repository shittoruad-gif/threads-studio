/**
 * 慣らし運転の判定（サーバー側）。shared/accountRamp.ts の日数判定に、
 *  - 「Threads歴の長いアカウントには掛けない」（直近100件の最古が30日以上前、またはフォロワー100以上）
 *  - 「慣らしで減った分の補填」（連携30日以内・契約×経過日数に届いていなければ＋1件）
 * を足す。判定は1日キャッシュ。
 */
import * as db from "./db";
import { rampCap, rampNote, compensationCount, compensationNote, COMPENSATION_WINDOW_DAYS } from "../shared/accountRamp";

const ESTABLISHED_DAYS = 30;
const ESTABLISHED_FOLLOWERS = 100;
const cache = new Map<number, { day: string; established: boolean }>();

export async function isEstablishedAccount(account: { id: number; threadsUserId: string; accessToken?: string }): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const c = cache.get(account.id);
  if (c && c.day === day) return c.established;
  let established = false;
  try {
    // ★トークンは必ず復号済みのものを使う（一覧取得の行は暗号化されたまま＝APIが失敗して
    //   「新規」扱いになっていた。2026-09-07 岩根様（投稿歴2025年10月〜）が慣らし運転にかかった原因）
    const full: any = await db.getThreadsAccountById(account.id);
    const token = full?.accessToken; const tuid = full?.threadsUserId || account.threadsUserId;
    if (!token) throw new Error("no token");
    const r: any = await (await fetch(`https://graph.threads.net/v1.0/${tuid}/threads?fields=id,timestamp&limit=100&access_token=${token}`)).json();
    if (r?.error) console.warn(`[Ramp] history check failed @${account.id}: ${JSON.stringify(r.error).slice(0, 120)}`);
    const ts: number[] = (r?.data ?? []).map((p: any) => new Date(p.timestamp).getTime()).filter((n: number) => Number.isFinite(n));
    if (ts.length > 0 && (Date.now() - Math.min(...ts)) / 86400000 >= ESTABLISHED_DAYS) established = true;
    if (!established) {
      const fi: any = await (await fetch(`https://graph.threads.net/v1.0/${tuid}/threads_insights?metric=followers_count&access_token=${token}`)).json();
      const followers = Number(fi?.data?.[0]?.total_value?.value ?? fi?.data?.[0]?.values?.[0]?.value ?? 0);
      if (followers >= ESTABLISHED_FOLLOWERS) established = true;
    }
  } catch { established = false; }
  cache.set(account.id, { day, established });
  return established;
}

export interface RampDecision {
  /** 今日つくる本数 */
  count: number;
  /** 慣らしで契約より少ない */
  capped: boolean;
  /** 補填で契約より多い */
  extra: boolean;
  days: number;
  note: string;
  established: boolean;
  shortfall: number;
}

/** そのアカウントの今日の本数（contract=契約本数） */
export async function rampForAccount(
  account: { id: number; threadsUserId: string; accessToken: string; createdAt?: Date | string | null },
  contract: number,
): Promise<RampDecision> {
  const r = rampCap(contract, account.createdAt);
  const base: RampDecision = { count: contract, capped: false, extra: false, days: r.days, note: "", established: false, shortfall: 0 };
  if (r.days >= COMPENSATION_WINDOW_DAYS) return base; // 30日を過ぎたら通常
  const established = await isEstablishedAccount(account);
  if (established) return { ...base, established: true };
  if (r.capped) return { ...base, count: r.count, capped: true, note: rampNote(r.days, contract) };
  // 慣らしを抜けた：減った分を補填
  let posted = 0;
  try { posted = await db.countAccountAutoPostsSinceConnect(account.id); } catch { posted = contract * r.days; }
  const c = compensationCount(contract, r.days, posted);
  if (c.count > contract) return { ...base, count: c.count, extra: true, shortfall: c.shortfall, note: compensationNote(contract, c.shortfall) };
  return base;
}

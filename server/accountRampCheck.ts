/**
 * 慣らし運転の判定（サーバー側）。shared/accountRamp.ts の日数判定に、
 * 「Threads歴の長いアカウントには掛けない」を足す（2026-09-07 比嘉様の質問を受けて）。
 *
 * Threads APIにアカウント作成日は無いので、直近25件の投稿の最古が30日より前なら
 * 「以前から使っているアカウント」とみなして慣らし運転を外す。判定結果は1日キャッシュ。
 */
import { rampCap, rampNote } from "../shared/accountRamp";

const ESTABLISHED_DAYS = 30;
const cache = new Map<number, { day: string; established: boolean }>();

export async function isEstablishedAccount(account: { id: number; threadsUserId: string; accessToken: string }): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const c = cache.get(account.id);
  if (c && c.day === day) return c.established;
  let established = false;
  try {
    const r: any = await (await fetch(`https://graph.threads.net/v1.0/${account.threadsUserId}/threads?fields=id,timestamp&limit=25&access_token=${account.accessToken}`)).json();
    const ts: number[] = (r?.data ?? []).map((p: any) => new Date(p.timestamp).getTime()).filter((n: number) => Number.isFinite(n));
    if (ts.length >= 20) {
      const oldest = Math.min(...ts);
      established = (Date.now() - oldest) / 86400000 >= ESTABLISHED_DAYS;
    }
  } catch { established = false; }
  cache.set(account.id, { day, established });
  return established;
}

/** そのアカウントの今日の上限（contract=契約本数）。established なら契約どおり。 */
export async function rampForAccount(
  account: { id: number; threadsUserId: string; accessToken: string; createdAt?: Date | string | null },
  contract: number,
): Promise<{ count: number; capped: boolean; days: number; note: string; established: boolean }> {
  const r = rampCap(contract, account.createdAt);
  if (!r.capped) return { ...r, note: "", established: false };
  const established = await isEstablishedAccount(account);
  if (established) return { count: contract, capped: false, days: r.days, note: "", established: true };
  return { ...r, note: rampNote(r.days), established: false };
}

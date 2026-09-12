/**
 * 慣らし運転の判定（サーバー側）。shared/accountRamp.ts の日数判定に、
 *  - 「Threads歴の長いアカウントには掛けない」（直近100件の最古が30日以上前、またはフォロワー100以上）
 *  - 「慣らしで減った分の補填」（連携30日以内・契約×経過日数に届いていなければ＋1件）
 * を足す。判定は1日キャッシュ。
 */
import * as db from "./db";
import { rampCap, rampNote, compensationCount, compensationNote, manualExtraPosts, inCooldown, dateColToJst, COMPENSATION_WINDOW_DAYS } from "../shared/accountRamp";

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
  account: { id: number; threadsUserId: string; accessToken: string; createdAt?: Date | string | null; extraPostsPerDay?: number | null; extraPostsUntil?: Date | string | null; extraPostsReason?: string | null },
  contract: number,
): Promise<RampDecision> {
  // ★投稿が消された（スパム判定）アカウントは冷却期間中、1日1件に落とす（2026-09-12）。補填も乗せない
  if (inCooldown(account as any)) {
    const until = dateColToJst((account as any).cooldownUntil).replace(/^\d{4}-/, "").replace("-", "/");
    return { count: 1, capped: true, extra: false, days: 0, note: `投稿が消されたため${until}まで1日1件に抑えています（アカウントを守るため）`, established: false, shortfall: 0 };
  }
  const base0 = await rampDecision(account, contract);
  // ★運営が決めた補填（期間限定で1日＋n件。2026-09-10 プレステージ様）。慣らし中は掛けない（安全側）。
  const m = manualExtraPosts(account);
  if (m.extra > 0 && !base0.capped) {
    // ★1日に足せるのは、連携30日未満は＋1件、それ以降は＋2件まで（慣らしの補填と手動の補填が重なっても増やしすぎない。
    //   新しいアカウントに1日5件は停止の危険が戻る。2026-09-11 廿日市様）
    const cap = contract + (base0.days < COMPENSATION_WINDOW_DAYS ? 1 : 2);
    const count = Math.min(base0.count + m.extra, cap);
    if (count <= base0.count) return base0;
    return { ...base0, count, extra: true, note: [base0.note, m.note].filter(Boolean).join("／") };
  }
  return base0;
}

async function rampDecision(
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

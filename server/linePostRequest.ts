/**
 * 公式LINEに送っていただいた文章を、空いている日と時間に予約する（2026-11-01・shared/linePostRequest.ts）。
 *
 * 空いているか＝慣らし・冷却中（1日の数を抑えている間）は、その日の投稿の数が上限に届いていないこと。
 * 上限に届いた日に入れると、自動の投稿が翌日に回ってしまう（11/1 のお客様の食い違いの元）。
 * 抑えていないアカウントは数を見ず、ほかの投稿と90分あけられる時間があればよい。
 */
import * as db from "./db";
import { dailyCapDecision, threadsPostsTodayCount } from "./dailyCapCheck";
import { rampCap, jstDateString } from "../shared/accountRamp";
import { pickPostTime } from "../shared/linePostRequest";

/** その日の上限と、すでにある数（上限を掛けていない日は cap=null） */
export async function dayCapacity(account: any, userId: number, dayJst: string, now: number = Date.now()): Promise<{ cap: number | null; used: number; existing: number[] }> {
  const existing = await db.getAccountPostTimesOnDay(Number(account.id), dayJst);
  const dc = await dailyCapDecision(account, userId);
  let cap: number | null = null;
  if (dc.strict) {
    if (dc.reason === "cooldown") cap = dayJst <= dc.untilJst ? 1 : null;
    else {
      const r = rampCap(dc.contract, account.createdAt, Date.parse(`${dayJst}T12:00:00+09:00`));
      cap = r.capped ? r.count : null;
    }
  }
  let used = existing.length;
  // 今日はThreadsの実測（アプリから直接出した分を含む）も見る
  if (cap !== null && dayJst === jstDateString(0, now)) {
    const n = await threadsPostsTodayCount(account.accessToken, account.threadsUserId).catch(() => 0);
    used = Math.max(used, n);
  }
  return { cap, used, existing };
}

/** その日に出せる時刻（空いていなければ null） */
export async function openSlotOnDay(account: any, userId: number, dayJst: string, now: number = Date.now()): Promise<Date | null> {
  const { cap, used, existing } = await dayCapacity(account, userId, dayJst, now);
  if (cap !== null && used >= cap) return null;
  return pickPostTime({ dayJst, now, existing });
}

/** 今日に入らなかった理由の一文（今日に入ったときは空） */
export async function notTodayReason(account: any, userId: number, at: Date, now: number = Date.now()): Promise<string> {
  const today = jstDateString(0, now);
  if (jstDateString(0, at.getTime()) === today) return "";
  const { cap, used } = await dayCapacity(account, userId, today, now);
  if (cap !== null && used >= cap) return `今日はすでに${used}件の投稿があり、いまは1日${cap}件までのため、いちばん早く空いている日に入れました。`;
  return "今日はこれから出せる時間が残っていないため、いちばん早く空いている日に入れました。";
}

/** 今日から順に、空いている日を最大 n 日（14日先まで見る） */
export async function openDays(account: any, userId: number, n: number, now: number = Date.now()): Promise<Array<{ day: string; at: Date }>> {
  const out: Array<{ day: string; at: Date }> = [];
  for (let i = 0; i < 14 && out.length < n; i++) {
    const day = jstDateString(i, now);
    const at = await openSlotOnDay(account, userId, day, now);
    if (at) out.push({ day, at });
  }
  return out;
}

/** お店（プロジェクト）：このアカウントの直近の投稿のもの、無ければお店の情報の1件目 */
export async function projectIdForAccount(accountId: number, userId: number): Promise<string | null> {
  const fromPosts = await db.getLatestProjectIdForAccount(accountId);
  if (fromPosts) return fromPosts;
  const pjs = ((await db.getUserProjects(userId)) || []).filter((pj: any) => !String(pj.id).startsWith("demo_"));
  return pjs[0]?.id ? String(pjs[0].id) : null;
}

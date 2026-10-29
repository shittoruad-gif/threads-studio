/**
 * つなぎたいアカウントと違ったときに、連携を保存せずに少しだけ預かっておく（shared/connectCheck.ts・2026-10-29）。
 *   ご本人が「このアカウントで使う」を選べば、Threads のログインをやり直さずにそのまま保存できる。
 *   「正しいアカウントでやり直す」を選べば捨てる。15分たったら自動で捨てる。
 *   サーバーの記憶だけに置く（トークンをDBに書かない・再起動で消えても「もう一度連携を押す」で済む）。
 */
export interface PendingConnect {
  profile: any;
  longLivedToken: { access_token: string; expires_in: number };
  kind: "mismatch" | "same_as_existing";
  expected: string | null;
  device: "android" | "iphone" | "pc";
  at: number;
}

export const PENDING_CONNECT_TTL_MS = 15 * 60_000;
const store = new Map<number, PendingConnect>();

function sweep(now: number) {
  store.forEach((v, k) => { if (now - v.at > PENDING_CONNECT_TTL_MS) store.delete(k); });
}

export function stashPendingConnect(userId: number, p: Omit<PendingConnect, "at">, now: number = Date.now()): void {
  sweep(now);
  store.set(userId, { ...p, at: now });
}

/** 取り出したら消す（同じものを2回使わない） */
export function takePendingConnect(userId: number, now: number = Date.now()): PendingConnect | null {
  sweep(now);
  const p = store.get(userId) ?? null;
  store.delete(userId);
  return p;
}

export function peekPendingConnect(userId: number, now: number = Date.now()): PendingConnect | null {
  sweep(now);
  return store.get(userId) ?? null;
}

/**
 * 新しいThreadsアカウントの「慣らし運転」（2026-09-06 梅原様のアカウント停止を受けて）。
 *
 * 事実：連携4日目・フォロワー0のアカウントに、自動3件＋ご本人の手動2〜3件＝1日5〜6件を
 * 同じ話題で出し続け、Instagramの本人確認（ロボット判定→電話→顔写真）と停止が2回起きた。
 * 新しいアカウントで最初から機械的に多く出すのは、Meta側にスパムと見えやすい。
 *
 * 決まり：連携から7日未満は1日1件、14日未満は1日2件まで（契約本数より少なければそちら）。
 * 14日以降は契約どおり。フォロワーが付いていても同じ（日数だけで判定＝説明しやすい）。
 */
export const RAMP_DAYS_1 = 7;
export const RAMP_DAYS_2 = 14;

export function accountAgeDays(createdAt: Date | string | null | undefined, now: number = Date.now()): number {
  if (!createdAt) return 999;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 999;
  return Math.floor((now - t) / 86400000);
}

/** その日の上限（契約本数 want を新しさで頭打ちにする） */
export function rampCap(want: number, createdAt: Date | string | null | undefined, now: number = Date.now()): { count: number; capped: boolean; days: number } {
  const days = accountAgeDays(createdAt, now);
  const cap = days < RAMP_DAYS_1 ? 1 : days < RAMP_DAYS_2 ? 2 : Infinity;
  const count = Math.min(want, cap);
  return { count, capped: count < want, days };
}

export function rampNote(days: number): string {
  if (days < RAMP_DAYS_1) return `連携から${days}日目のため1日1件（7日目まで）`;
  if (days < RAMP_DAYS_2) return `連携から${days}日目のため1日2件（14日目まで）`;
  return "";
}

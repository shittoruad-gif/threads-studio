/**
 * アカウントごとに決めておく自動投稿の時刻（threadsAccounts.fixedPostHours・0114）。
 *
 * お客様が「自動の投稿は12:00に。2本になったら12:00と15:00に」のように時刻を決めたいときに使う。
 *   - 値はカンマ区切りの時（JST）。例 "12,15"。NULL＝今まで通り（過去の反応から決めた時間帯・既定の時間帯）。
 *   - その日の自動 N 本は、決めた時刻の前から N 個を使う。分はちょうど0分。
 *   - その時刻にすでに投稿（ご本人の投稿・前の晩に作った分など）があれば、その時刻は使わず次の決めた時刻へ。
 *   - もう過ぎた時刻（当日分）は使わない。
 *   - 決めた時刻で足りない分は、今までの決め方で決め、決めた時刻と既存の投稿から gap 以上離す。
 */

const JST_MS = 9 * 3600_000;

export const FIXED_POST_HOURS_MAX = 5;

/** 同じアカウントの投稿どうしを離す間隔（分）。server/autoPostScheduler.ts の当日補充（buildSameDaySlots）と共通 */
export const OCCUPIED_GAP_MINUTES = 60;

export type FixedPostHoursResult =
  | { ok: true; hours: number[]; value: string }
  | { ok: false; error: string };

/** 入力（"12,15" など）を検証する。0〜23の整数・重複なし・最大5件・昇順。空は「解除」（hours=[]・value=""） */
export function validateFixedPostHours(input: string): FixedPostHoursResult {
  const s = String(input ?? "").trim();
  if (s === "") return { ok: true, hours: [], value: "" };
  const parts = s.split(",").map((p) => p.trim());
  const hours: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,2}$/.test(p)) return { ok: false, error: `「${p}」は時（0〜23の整数）ではありません` };
    const h = Number(p);
    if (h < 0 || h > 23) return { ok: false, error: `${h}は0〜23の範囲外です` };
    hours.push(h);
  }
  if (new Set(hours).size !== hours.length) return { ok: false, error: "同じ時刻が2回入っています" };
  if (hours.length > FIXED_POST_HOURS_MAX) return { ok: false, error: `時刻は最大${FIXED_POST_HOURS_MAX}件までです` };
  for (let i = 1; i < hours.length; i++) {
    if (hours[i] <= hours[i - 1]) return { ok: false, error: "時刻は早い順（昇順）に並べてください" };
  }
  return { ok: true, hours, value: hours.join(",") };
}

/** DB の値を読む。NULL・空・決まりに合わない値は null（＝今まで通り）にする */
export function parseFixedPostHours(raw: unknown): number[] | null {
  if (raw === null || raw === undefined) return null;
  const r = validateFixedPostHours(String(raw));
  return r.ok && r.hours.length > 0 ? r.hours : null;
}

/** 「何日後か」（JST）の h:00 */
export function jstHourOnDay(h: number, dayOffset: number, now: Date): Date {
  const j = new Date(now.getTime() + JST_MS);
  return new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate() + dayOffset, h, 0, 0) - JST_MS);
}

/** YYYY-MM-DD（JST）の h:00 */
export function jstHourOnDate(h: number, ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, 0, 0) - JST_MS);
}

function isFree(t: number, taken: number[], gapMs: number): boolean {
  return taken.every((o) => Math.abs(t - o) >= gapMs);
}

/**
 * 決めた時刻のうち、この日に使えるものを前から最大 count 個（分はちょうど0分）。
 * 既存の投稿（occupied）から gap 未満の時刻と、earliest より前（もう過ぎた・直前すぎる）の時刻は飛ばす。
 */
export function fixedSlotTimes(args: {
  hours: number[];
  count: number;
  dayOffset: number;
  now: Date;
  occupied: Date[];
  gapMinutes: number;
  /** これより前の時刻は使わない（既定：今から10分後） */
  earliest?: number;
}): Date[] {
  const { hours, count, dayOffset, now, occupied, gapMinutes } = args;
  if (count <= 0 || hours.length === 0) return [];
  const earliest = args.earliest ?? now.getTime() + 10 * 60_000;
  const gap = gapMinutes * 60_000;
  const taken = occupied.map((d) => d.getTime());
  const out: Date[] = [];
  for (const h of hours) {
    if (out.length >= count) break;
    const t = jstHourOnDay(h, dayOffset, now).getTime();
    if (t < earliest) continue;
    if (!isFree(t, taken, gap)) continue;
    out.push(new Date(t));
  }
  return out;
}

/**
 * その日の新しい自動投稿 count 本の時刻を決める（朝の回・前の晩の回）。
 *   1. 決めた時刻を前から（fixedSlotTimes）
 *   2. 足りない分は今までの決め方 defaultAt(k)（k はその枠の番号）。決めた時刻・既存の投稿・先に決めた枠から
 *      gap 以上離れていて、同じ日（JST）で earliest より後のものを、k を1つずつ進めて探す。
 *   3. それでも無ければ、その日の 7:00〜23:50 を5分刻みで見て最初に空いている時刻。無ければ defaultAt(k) のまま。
 * 戻り値の i 番目が i 番目の枠の時刻。
 */
export function planFixedDaySlots(args: {
  hours: number[];
  count: number;
  dayOffset: number;
  now: Date;
  occupied: Date[];
  gapMinutes: number;
  defaultAt: (k: number) => Date;
}): Date[] {
  const { hours, count, dayOffset, now, occupied, gapMinutes, defaultAt } = args;
  if (count <= 0) return [];
  const earliest = now.getTime() + 10 * 60_000;
  const gap = gapMinutes * 60_000;
  const fixed = fixedSlotTimes({ hours, count, dayOffset, now, occupied, gapMinutes, earliest });
  const out: Date[] = [...fixed];
  const taken = [...occupied.map((d) => d.getTime()), ...fixed.map((d) => d.getTime())];
  const dayStart = jstHourOnDay(0, dayOffset, now).getTime();
  const dayEnd = dayStart + 24 * 3600_000;
  for (let i = fixed.length; i < count; i++) {
    let chosen: number | null = null;
    for (let k = i; k < i + 8 && chosen === null; k++) {
      const t = defaultAt(k).getTime();
      if (t >= dayStart && t < dayEnd && t >= earliest && isFree(t, taken, gap)) chosen = t;
    }
    if (chosen === null) {
      const from = Math.max(earliest, dayStart + 7 * 3600_000);
      const to = dayStart + (23 * 60 + 50) * 60_000;
      for (let t = Math.ceil(from / 300_000) * 300_000; t <= to; t += 300_000) {
        if (isFree(t, taken, gap)) { chosen = t; break; }
      }
    }
    if (chosen === null) chosen = defaultAt(i).getTime();
    out.push(new Date(chosen));
    taken.push(chosen);
  }
  return out;
}

/**
 * 翌日へ回す投稿の時刻（上限を超えた分の繰り延べ）。base は今までの決め方（nextDaySameTime）の結果。
 *   - base がちょうど決めた時刻で、その日の他の投稿と重ならなければ base のまま。
 *   - そうでなければ、その日の決めた時刻のうち空いている最初のもの。
 *   - どれも空いていなければ base のまま。
 */
export function deferredTimeForFixedHours(base: Date, hours: number[] | null, occupiedThatDay: Date[], gapMinutes: number): Date {
  if (!hours || hours.length === 0) return base;
  const gap = gapMinutes * 60_000;
  const taken = occupiedThatDay.map((d) => d.getTime());
  const ymd = new Date(base.getTime() + JST_MS).toISOString().slice(0, 10);
  const j = new Date(base.getTime() + JST_MS);
  if (j.getUTCMinutes() === 0 && hours.includes(j.getUTCHours()) && isFree(base.getTime(), taken, gap)) return base;
  for (const h of hours) {
    const t = jstHourOnDate(h, ymd).getTime();
    if (isFree(t, taken, gap)) return new Date(t);
  }
  return base;
}

/**
 * 枠 i の時刻を外で決めて渡すか（server/autoPostScheduler.ts の生成ループ）。null なら generateAutoPost の中で今まで通り決める。
 *   当日補充 → sameDaySlots[i]／決めてある時刻 → plannedTimes[i]／前の晩の回 → tomorrowAt(i)／朝の回 → null
 * plannedTimes が null（fixedPostHours が NULL のアカウント）なら、入れる前と同じ結果になる。
 */
export function slotTimeForIndex(
  i: number,
  o: { sameDaySlots: Date[] | null; plannedTimes: Date[] | null; forTomorrow: boolean; tomorrowAt: (i: number) => Date },
): Date | null {
  if (o.sameDaySlots) return o.sameDaySlots[i];
  return o.plannedTimes?.[i] ?? (o.forTomorrow ? o.tomorrowAt(i) : null);
}

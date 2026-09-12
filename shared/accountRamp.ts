/**
 * 新しいThreadsアカウントの「慣らし運転」と「減った分の補填」（2026-09-06〜07）。
 *
 * 事実：連携4日目・フォロワー0のアカウントに自動3件＋手動2〜3件＝1日5〜6件を出し続け、
 * 本人確認→停止が2回起きた（Meta側は後に「準拠していた」と誤判定を認めた）。
 * 新しいアカウントで最初から機械的に多く出すのは、Meta側の自動判定にスパムと見えやすい。
 *
 * 決まり（2026-09-07 三上様指示「1日3件で契約している方に違和感を与えない。減った分は補填し、30日で90件」）
 *  - 連携1〜5日目：1日1件、6〜10日目：1日2件、11日目〜：契約どおり
 *  - 慣らしで減った分は、11日目以降に1日＋1件（3件契約なら4件）で補い、30日間の合計を契約どおり（3件×30＝90件）にする
 *    例：5＋10＝15件（10日）→ 残り20日で75件が必要 → 4件×15日＋3件×5日 ＝ 90件（28日目ごろに追いつく）
 *  - Threads歴が長いアカウント（30日以上前の投稿がある／フォロワー100以上）には慣らしを掛けない（server/accountRampCheck.ts）
 */
export const RAMP_DAYS_1 = 5;
export const RAMP_DAYS_2 = 10;
export const COMPENSATION_WINDOW_DAYS = 30;
export const COMPENSATION_EXTRA_PER_DAY = 1;

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

/**
 * 慣らしで減った分の補填。連携から30日以内で、これまでの実績が「契約×経過日数」に届いていなければ、
 * 契約本数＋1件を返す（それ以上は増やさない＝1日4件まで）。
 */
export function compensationCount(want: number, days: number, postedSinceConnect: number, now?: number): { count: number; shortfall: number } {
  const elapsed = Math.min(days, COMPENSATION_WINDOW_DAYS); // 今日を含まない経過日数
  const expected = want * elapsed;
  const shortfall = Math.max(0, expected - postedSinceConnect);
  if (days >= COMPENSATION_WINDOW_DAYS || shortfall <= 0 || want < 2) return { count: want, shortfall };
  return { count: want + COMPENSATION_EXTRA_PER_DAY, shortfall };
}

/**
 * 連携した日を「1日目」と数えた表示用の日数。
 * お客様に見せる文はすべてこれを通す（生成側は「8日目」・公開側は「7日目」と
 * 食い違っていた・2026-09-10）。
 */
export function rampDayLabel(days: number): number {
  return days + 1;
}

export function rampNote(days: number, want: number = 3): string {
  const n = rampDayLabel(days); // 連携した日を「1日目」と数える
  const tail = want >= 2 ? `。減った分は${RAMP_DAYS_2 + 1}日目以降に1日${want + COMPENSATION_EXTRA_PER_DAY}件で補い、30日間で${want * 30}件になります` : "";
  if (days < RAMP_DAYS_1) return `慣らし運転：連携から${n}日目のため1日1件（${RAMP_DAYS_1}日目まで）${tail}`;
  if (days < RAMP_DAYS_2) return `慣らし運転：連携から${n}日目のため1日2件（${RAMP_DAYS_2}日目まで）${tail}`;
  return "";
}

export function compensationNote(want: number, shortfall: number): string {
  return `補填中：慣らし運転で減った分（あと${shortfall}件）を1日${want + COMPENSATION_EXTRA_PER_DAY}件で補っています`;
}

/**
 * 運営が決めた補填（届かなかった分を、期間限定で1日＋n件）。
 * extraPostsUntil はJSTの日付（含む）。期間を過ぎたら 0。
 */
export function manualExtraPosts(
  account: { extraPostsPerDay?: number | null; extraPostsUntil?: Date | string | null; extraPostsReason?: string | null } | null | undefined,
  todayJst: string = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10),
): { extra: number; note: string } {
  const n = Number(account?.extraPostsPerDay ?? 0);
  if (!account || !Number.isFinite(n) || n <= 0 || !account.extraPostsUntil) return { extra: 0, note: "" };
  const until = account.extraPostsUntil instanceof Date
    ? new Date(account.extraPostsUntil.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    : String(account.extraPostsUntil).slice(0, 10);
  if (todayJst > until) return { extra: 0, note: "" };
  return { extra: n, note: String(account.extraPostsReason || `届かなかった分の補填（${until.replace(/^\d{4}-/, "").replace("-", "/")}まで1日＋${n}件）`) };
}

/** JSTの日付（YYYY-MM-DD）。offsetDays=-1 で昨日 */
export function jstDateString(offsetDays = 0, now: number = Date.now()): string {
  return new Date(now + 9 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
}

/** DBの date 列（Date か文字列）を YYYY-MM-DD（JST）にそろえる */
export function dateColToJst(v: Date | string | null | undefined): string {
  if (!v) return "";
  return v instanceof Date ? new Date(v.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10) : String(v).slice(0, 10);
}

/** 1日に足せる本数の上限（手動の補填＋自動の繰り越しを合わせて） */
export const MAX_EXTRA_PER_DAY = 2;

/**
 * 昨日届かなかった分を今日に足す数（自動補填）。
 * 昨日の生成で落ちた枠（shortfall）があれば、手動の補填と合わせて1日＋2件まで。
 */
export function carryOverCount(
  account: { shortfallDate?: Date | string | null; shortfallCount?: number | null } | null | undefined,
  alreadyExtra: number,
  todayJst: string = jstDateString(0),
): number {
  if (!account) return 0;
  const n = Number(account.shortfallCount ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const yday = jstDateString(-1, Date.parse(todayJst + "T00:00:00+09:00") + 12 * 3600 * 1000);
  if (dateColToJst(account.shortfallDate) !== yday) return 0;
  return Math.max(0, Math.min(n, MAX_EXTRA_PER_DAY - Math.max(0, alreadyExtra)));
}

/** 投稿が消されたアカウントの冷却期間（日）。この間は1日1件・自己返信とリンクコメントなし */
export const COOLDOWN_DAYS = 7;

/** 冷却期間中か（cooldownUntil はJSTの日付・含む） */
export function inCooldown(account: { cooldownUntil?: Date | string | null } | null | undefined, todayJst: string = jstDateString(0)): boolean {
  const until = dateColToJst(account?.cooldownUntil);
  return !!until && todayJst <= until;
}

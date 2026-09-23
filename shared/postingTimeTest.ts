/**
 * 投稿時間の試験（2026-09-24 三上様「本当にどの時間が一番伸びるのか、一回テストしてほしい。
 * Moveact と、そら先生、株式会社しっとるのアカウントで」→ 同日「朝7時から1時間単位で実験してみて」）。
 *
 * やること:
 *   対象アカウントだけ、投稿する時間を 7時〜23時 の1時間ごと（17通り）から日替わりで回す。
 *   本数・中身・承認の設定は変えない（1日3件なら3件のまま、時間だけが変わる）。
 *
 * 回し方:
 *   17日で1周。各日は候補のうち {r, r+6, r+11} 番目を使う（r = 経過日数＋アカウントごとのずらし）。
 *   17日で各時間がちょうど3回ずつ出る。1周が17日なので、同じ時間が同じ曜日に固まらない。
 *   アカウントごとに1つずつずらすので、同じ日の4アカウント×3枠＝12枠はすべて別の時間になる。
 *   1日の3枠は5時間以上あく（ランダムの分0〜29分を足しても連投にならない）。
 *   4件目（補填の日）は r+3 番目で、ほかの枠と3時間以上あく。
 *
 * 期間: 17日×2周＝34日。1周目の終わり（10/10）で途中の見立て、2周目の終わり（10/27）で結論。
 * 期間が過ぎたら null を返し、自動で今までどおり（本人の実績で伸びる時間）に戻る。
 */

export const POSTING_TIME_TEST = {
  // 玉島(10)・金光(12)・しっとる公式(14) は三上様、11 は そら先生（@takimoto_sora）
  accountIds: [10, 12, 14, 11] as const,
  // 7時〜23時の1時間ごと（三上様指示「朝7時から1時間単位で」）
  hours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] as const,
  start: "2026-09-24", // JST・この日の朝の生成から
  end: "2026-10-27",   // JST・この日まで（17日×2周＝34日。各時間が1アカウントあたり6本・合算24本）
  firstRoundEnd: "2026-10-10", // 1周目の終わり（途中の見立て）
};

// 1日のうち何番目の枠にどの候補を当てるか（先頭3つが3件の日、4つ目は補填の日）
const DAY_ORDER = [0, 6, 11, 3];

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function jstDayNumber(date: Date): number {
  return Math.floor((date.getTime() + JST_OFFSET_MS) / 86_400_000);
}

function dayNumberOf(ymd: string): number {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
}

/** 試験中なら、その日のこのアカウントの時間（枠の順・4つ）を返す。対象外・期間外は null。 */
export function postingTimeTestHours(accountId: number, now: Date = new Date()): number[] | null {
  const pos = (POSTING_TIME_TEST.accountIds as readonly number[]).indexOf(accountId);
  if (pos < 0) return null;
  const today = jstDayNumber(now);
  const start = dayNumberOf(POSTING_TIME_TEST.start);
  const end = dayNumberOf(POSTING_TIME_TEST.end);
  if (today < start || today > end) return null;
  const n = POSTING_TIME_TEST.hours.length;
  const r = (today - start + pos) % n;
  return DAY_ORDER.map((o) => POSTING_TIME_TEST.hours[(r + o) % n]);
}

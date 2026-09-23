/**
 * 投稿時間の試験（2026-09-24 三上様「本当にどの時間が一番伸びるのか、一回テストしてほしい。
 * Moveact と、そら先生、株式会社しっとるのアカウントで」）。
 *
 * やること:
 *   対象アカウントだけ、投稿する時間を6つの候補から日替わりで回す。
 *   本数・中身・承認の設定は変えない（1日3件なら3件のまま、時間だけが変わる）。
 *
 * 回し方:
 *   6日で1周。各日は候補のうち {r, r+1, r+3} 番目を使う（r = 経過日数＋アカウントごとのずらし）。
 *   6日で各時間がちょうど3回ずつ出る。1周が6日なので、同じ時間が同じ曜日に固まらない。
 *   アカウントごとに1日ずつずらし、同じ日に全員が同じ時間にならないようにする。
 *   候補の間は2時間以上あくので、ランダムの分（0〜29分）を足しても連投にならない。
 *
 * 期間が過ぎたら null を返し、自動で今までどおり（本人の実績で伸びる時間）に戻る。
 */

export const POSTING_TIME_TEST = {
  // 玉島(10)・金光(12)・しっとる公式(14) は三上様、11 は そら先生（@takimoto_sora）
  accountIds: [10, 12, 14, 11] as const,
  // 9時=朝／12時=昼／15時=全体の実測で最上位／18時=夕方／21時・23時=夜（この4アカウントの最上位22時の前後）
  // ★朝は9時から。毎朝の点検（8:10）が試験用の切り口の投稿を公開前に見られるように、8時台には出さない。
  hours: [9, 12, 15, 18, 21, 23] as const,
  start: "2026-09-24", // JST・この日の朝の生成から
  end: "2026-10-11",   // JST・この日まで（6日×3周＝18日。各時間が1アカウントあたり9本）
};

// 1日のうち何番目の枠にどの候補を当てるか（先頭3つが3件の日に使われる）
const DAY_ORDER = [0, 1, 3, 2, 4, 5];

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function jstDayNumber(date: Date): number {
  return Math.floor((date.getTime() + JST_OFFSET_MS) / 86_400_000);
}

function dayNumberOf(ymd: string): number {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
}

/** 試験中なら、その日のこのアカウントの時間（6つ・枠の順）を返す。対象外・期間外は null。 */
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

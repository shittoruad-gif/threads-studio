/**
 * 案を確認しやすい時間（2026-09-24 三上様指示）。
 *
 * > 「クライアントが何時に送られてくるのが一番見やすいかを聞くような形にして。
 * >   お昼の12時だったら見れるのであれば、それより前に送る。夜9時に見れるのであれば、
 * >   夜9時に次の日の生成文を送って判断しておいてもらう。きちんとすべて判断ができる形に」
 *
 * 公開前確認（autoPostRequireApproval）のお客様にだけ効く。未設定（null）は今までどおり
 * （朝6時に作ってすぐお届け）。
 *
 *   昼まで（7〜14時）… 朝6時に作ってお届けし、公開はその時間の1時間後から。
 *                       見る前に予定時刻が来て、承認待ちのまま後ろへずれていくのを防ぐ。
 *   夕方以降（15〜23時）… 前の晩のその時間の30分前に「翌日分」を作ってお届けする。
 *                       夜のうちに判断していただき、翌日はそのまま公開される。
 */

/** お客様に選んでいただく時間（LINEのボタン） */
export const REVIEW_HOUR_OPTIONS: ReadonlyArray<{ hour: number; label: string }> = [
  { hour: 7, label: "朝7時ごろ" },
  { hour: 12, label: "昼12時ごろ" },
  { hour: 18, label: "夕方6時ごろ" },
  { hour: 21, label: "夜9時ごろ" },
];

/** これ以降の時間は「前の晩に翌日分」 */
export const EVENING_FROM_HOUR = 15;

export function normalizeReviewHour(h: unknown): number | null {
  const n = Number(h);
  if (h === null || h === undefined || h === "" || !Number.isInteger(n) || n < 0 || n > 23) return null;
  return n;
}

/** 前の晩に翌日分を作る時間帯か */
export function isEveningReview(h: number | null | undefined): boolean {
  const n = normalizeReviewHour(h);
  return n !== null && n >= EVENING_FROM_HOUR;
}

/** 朝に作る時間帯か（7〜14時） */
export function isDaytimeReview(h: number | null | undefined): boolean {
  const n = normalizeReviewHour(h);
  return n !== null && n >= 7 && n < EVENING_FROM_HOUR;
}

/** 夜の生成を走らせる時刻（JSTの時）。確認の30分前＝その前の時の30分 */
export function eveningGenerationHour(reviewHour: number): number {
  return reviewHour - 1;
}

/** 補いに使う時間（実測で伸びる時間帯を後ろから） */
const FILL_HOURS = [21, 15, 22, 20, 18, 16, 19, 17, 14, 13, 23];

/**
 * 昼までに確認されるお客様の投稿時間。確認の1時間後より前の枠は使わない。
 * 1日3件＋補填の4件目まで入るよう、少なくとも4つ返す（元の順番＝優先順を保つ）。
 */
export function hoursAfterReview(hours: readonly number[] | null | undefined, reviewHour: number): number[] {
  const min = reviewHour + 1;
  const out: number[] = [];
  for (const h of hours ?? []) if (h >= min && h <= 23 && !out.includes(h)) out.push(h);
  for (const h of FILL_HOURS) {
    if (out.length >= 4) break;
    if (h >= min && !out.includes(h)) out.push(h);
  }
  return out;
}

/** 選んでいただいたときのお返事 */
export function reviewHourReply(h: number | null): string {
  if (h === null) {
    return "承知しました。これまでどおり、毎朝6時ごろに案をお届けします。\n確認しやすい時間が決まったら、メニューの「設定」からいつでも選び直せます。";
  }
  const label = REVIEW_HOUR_OPTIONS.find((o) => o.hour === h)?.label ?? `${h}時ごろ`;
  if (isEveningReview(h)) {
    return `承知しました。${label}にしました。\n` +
      `これからは、前の日の${label}に「翌日の投稿の案」をお届けします。夜のうちにご確認いただければ、翌日はそのまま予定の時間に公開されます。\n` +
      "変えたいときは、メニューの「設定」からいつでも選び直せます。";
  }
  return `承知しました。${label}にしました。\n` +
    `これからは、毎朝その時間までに案をお届けし、公開は${h + 1}時以降にします。ご確認の前に公開時間が来ることはありません。\n` +
    "変えたいときは、メニューの「設定」からいつでも選び直せます。";
}

/** お尋ねの文（LINE） */
export const REVIEW_HOUR_QUESTION =
  "投稿の案は、何時ごろにお届けすると確認しやすいですか？\n" +
  "選んでいただいた時間に合わせてお届けし、ご確認の前に公開時間が来ないようにします。\n" +
  "・昼までの時間 … その日の朝にお届けし、公開はご確認のあとにします\n" +
  "・夕方・夜 … 前の日のその時間に、翌日の案をお届けします";

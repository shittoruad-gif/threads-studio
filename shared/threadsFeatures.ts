/**
 * Threads の機能を使った投稿の試し（2026-09-28 三上様指示
 * 「スレッズの使える機能をいろいろ使ってリーチを取れるようなものにしてください」
 * 「（アンケート機能を）勧め方の案どおりやってみ」）。
 *
 * 使うのは、いまの権限（threads_content_publish）のままで出せる機能だけ
 * （2026-09-28 に公式資料 developers.facebook.com/documentation/threads/create-posts で確認）:
 *   poll          … アンケート。選択肢2〜4個・各1〜25文字。テキストのみの投稿に付けられる。結果（割合・総数）は後から読める
 *   spoiler_quiz  … ネタバレ（text_entities の SPOILER）。クイズの答えを隠し、タップで見せる。1投稿10か所まで
 *   repost        … 再投稿（POST /{threads_id}/repost）。よく読まれた自分の投稿をもう一度フォロワーへ
 * 場所のタグ付け（threads_location_tagging）・Instagramストーリーズへの同時シェア（threads_share_to_instagram）は
 * Meta の追加審査が要るので、ここでは使わない。
 *
 * ★投稿時間の試験・他店の当たり型の試し（どちらも 10/27 まで）の集計を崩さないよう、10/28 から。
 * ★1日の本数は変えない。契約の枠のうち2本目（slotIndex=1）を毎日アンケートに、火・金は3本目（slotIndex=2）をクイズにする
 *   （2026-09-28 三上様「これは毎日投稿してみて」。最初は火=アンケート・金=クイズの週2本だった）。
 * ★効果は scripts/ops/threads-features-report.mts で、同じアカウントの普段の投稿と比べる。
 */

export const FEATURE_TRIAL = {
  /** Moveact 玉島・Moveact 金光・そら先生・しっとる公式（投稿時間の試験と同じ4つ） */
  accountIds: [10, 12, 11, 36] as readonly number[],
  /** 日本時間の日付（この日を含む） */
  start: "2026-10-28",
  end: "2026-11-30",
  /** アンケートにする枠（0始まり。2本目・毎日） */
  slotIndex: 1,
  /** クイズにする枠（3本目・火と金だけ） */
  quizSlotIndex: 2,
} as const;

export type FeatureKind = "poll" | "spoiler_quiz";

/** クイズを出す曜日（日本時間・0=日）。火と金 */
const QUIZ_WEEKDAYS: ReadonlySet<number> = new Set([2, 5]);
/** 再投稿は日曜に1本（投稿の枠とは別） */
export const REPOST_WEEKDAY = 0;

export const POLL_ANGLE_ID = "poll";
export const SPOILER_QUIZ_ANGLE_ID = "spoiler_quiz";

const JST = 9 * 3600_000;
export function jstDateOf(d: Date): string {
  return new Date(d.getTime() + JST).toISOString().slice(0, 10);
}
function jstWeekday(d: Date): number {
  return new Date(d.getTime() + JST).getUTCDay();
}

export function inFeatureTrial(accountId: number, day: Date): boolean {
  if (!FEATURE_TRIAL.accountIds.includes(accountId)) return false;
  const ds = jstDateOf(day);
  return ds >= FEATURE_TRIAL.start && ds <= FEATURE_TRIAL.end;
}

/** その枠を機能の投稿にするか。day は「公開する日」（前の晩に翌日分を作るときは翌日） */
export function featureForSlot(accountId: number, slotIndex: number, day: Date): FeatureKind | null {
  if (!inFeatureTrial(accountId, day)) return null;
  if (slotIndex === FEATURE_TRIAL.slotIndex) return "poll";
  if (slotIndex === FEATURE_TRIAL.quizSlotIndex && QUIZ_WEEKDAYS.has(jstWeekday(day))) return "spoiler_quiz";
  return null;
}

export function isRepostDay(accountId: number, day: Date): boolean {
  return inFeatureTrial(accountId, day) && jstWeekday(day) === REPOST_WEEKDAY;
}

/** 生成の切り口（autoPostScheduler の「今回の切り口」に入る） */
export function featureAngle(kind: FeatureKind): { id: string; label: string; hint: string } {
  if (kind === "poll") {
    return {
      id: POLL_ANGLE_ID,
      label: "アンケート（投票）",
      hint:
        "読む人に1つだけ質問し、投票で答えてもらう投稿。選択肢は投稿の下に別で付くので、本文には選択肢を書かない。"
        + "1行目で質問の場面を短く出し、最後の1行は必ず「？」で終わる質問にする（例の形：「朝いちばんつらいのはどこですか？」）。"
        + "答えを誘導しない。売り込み・来店のお願いは書かない。健康系のお店では、症状が治る・変わるといった結果を選択肢や本文で言い切らない。",
    };
  }
  return {
    id: SPOILER_QUIZ_ANGLE_ID,
    label: "クイズ（答えは隠す）",
    hint:
      "この店の仕事に関わる、答えが1つに決まるクイズを1問出す投稿。1行目で問題を出し、考えたくなる短い説明を続け、"
      + "最後の1行を必ず「答え：」で始めて答えを短く書く（15文字以内）。答えの行はタップするまで隠れて表示される。"
      + "答えは入力情報で確かめられる事実だけにする。健康系のお店では、効果や結果を答えにしない（体の仕組み・道具・言葉の意味などにする）。",
  };
}

/** Threads のアンケートの決まり：選択肢2〜4個・各1〜25文字（コードポイントで数える） */
export const POLL_OPTION_MAX = 25;

const URL_RE = /https?:\/\/|www\./i;

/**
 * AIが返した選択肢を検査して整える。決まりに合わなければ null（アンケートを付けずに通常の投稿として扱う）。
 * 受け付ける形：JSON 配列 ["A","B"] か、{"options":[...]}、または1行1つの箇条書き。
 */
export function parsePollOptions(raw: unknown): string[] | null {
  let list: unknown = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    const m = s.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (m) {
      try { list = JSON.parse(m[0]); } catch { list = null; }
    }
    if (!Array.isArray(list) && !(list && typeof list === "object")) {
      list = s.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-・*]|\d+[.)．、]|[A-DＡ-Ｄ][.)．:：])\s*/, ""));
    }
  }
  if (list && !Array.isArray(list) && typeof list === "object") list = (list as any).options;
  if (!Array.isArray(list)) return null;
  const out: string[] = [];
  for (const x of list) {
    const t = String(x ?? "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (Array.from(t).length > POLL_OPTION_MAX) return null;
    if (URL_RE.test(t)) return null;
    if (out.includes(t)) continue;
    out.push(t);
  }
  if (out.length < 2) return null;
  return out.slice(0, 4);
}

/** POST /threads の poll_attachment に渡す形 */
export function pollAttachment(options: string[]): Record<string, string> {
  const keys = ["option_a", "option_b", "option_c", "option_d"];
  const o: Record<string, string> = {};
  options.slice(0, 4).forEach((v, i) => { o[keys[i]] = v; });
  return o;
}

/** 本文が質問で終わっているか（アンケートの投稿の合格の印） */
export function endsWithQuestion(text: string): boolean {
  const lines = String(text ?? "").trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  return /[?？][\s\uFE0F\u200d\uD800-\uDFFF\u2600-\u27BF]*$/.test(last);
}

/**
 * クイズの答えの位置（ネタバレで隠す範囲）。最後の「答え：」の行の、コロンより後ろ。
 * offset・length は JavaScript の文字列の位置（UTF-16）。見つからなければ null（隠さずに通常の投稿）。
 * ★Threads 側が文字位置をどの単位で数えるかは資料に書いていないため、最初の公開で表示を目で確かめる。
 *   絵文字などサロゲートペアを含む本文ではずれる恐れがあるので、答えより前にそれがあれば隠さない。
 */
export function spoilerRange(text: string): { offset: number; length: number } | null {
  const t = String(text ?? "");
  const re = /答え\s*[:：]\s*/g;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(t))) last = m;
  if (!last) return null;
  const start = last.index + last[0].length;
  const lineEnd = t.indexOf("\n", start);
  const end = lineEnd < 0 ? t.length : lineEnd;
  const answer = t.slice(start, end).trimEnd();
  if (!answer) return null;
  if (/[\uD800-\uDBFF]/.test(t.slice(0, start))) return null;
  return { offset: start, length: answer.length };
}

/** POST /threads の text_entities に渡す形 */
export function spoilerEntities(text: string): Array<{ entity_type: "SPOILER"; offset: number; length: number }> | null {
  const r = spoilerRange(text);
  return r ? [{ entity_type: "SPOILER", ...r }] : null;
}

/** 承認カード・管理画面に添える一行 */
export function featureNote(p: { pollOptions?: string | null; angle?: string | null }): string | null {
  if (p.pollOptions) {
    try {
      const opts = JSON.parse(p.pollOptions) as string[];
      if (Array.isArray(opts) && opts.length >= 2) return `アンケートの選択肢：${opts.join("／")}`;
    } catch { /* 読めなければ出さない */ }
  }
  if (p.angle === SPOILER_QUIZ_ANGLE_ID) return "「答え：」の後ろはタップするまで隠れて表示されます";
  return null;
}

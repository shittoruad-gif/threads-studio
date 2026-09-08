/**
 * お客様がご自分で直した投稿から「好み」を読み取り、翌日以降の投稿に活かす（2026-09-08 三上様指示）。
 *
 * これまで：「文章をコピーして自分で直す」で直した内容は、その1投稿の本文を差し替えるだけだった。
 *           文体のお手本（projects.styleSamples）は連携したときに1回入るきりで、その後は更新されない。
 *           だから毎日直しても、翌日また同じ調子の投稿が届いていた。
 *
 * ここでやること：直した投稿（直す前・直した後）を材料に、
 *   1. 直した後の文を「お手本」として渡す（＝この人が良しとした文そのもの）
 *   2. 直す前にあって直した後に消された言い回しを「避けたい言い方」として渡す
 * 生成プロンプト（shared/threadsPrompts.ts）に足して、少しずつ理想へ寄せる。
 *
 * ★事実（お店の情報）には一切触れない。あくまで書き方の好みだけを扱う。
 */

export interface PostEdit {
  /** AIが作った文 */
  originalContent: string | null | undefined;
  /** お客様が直したあとの文 */
  postContent: string | null | undefined;
}

/** お手本として渡す件数（多すぎるとプロンプトが薄まる） */
export const PREFERENCE_SAMPLE_LIMIT = 5;
/** 「避けたい言い方」として拾う語の最大数 */
export const AVOID_LIMIT = 8;

const norm = (s: string) => s.replace(/\s+/g, "");

/**
 * 直す前にあって、直した後に無くなった「まとまった言い回し」を拾う。
 *
 * 文単位で見る（単語単位だと「が」「を」のような助詞まで拾ってしまう）。
 * 完全に消された文だけを対象にし、少しだけ直された文は拾わない。
 */
export function removedPhrases(edit: PostEdit): string[] {
  const before = String(edit.originalContent || "");
  const after = norm(String(edit.postContent || ""));
  if (!before || !after) return [];
  const sentences = before.match(/[^。！？!?\n]*[。！？!?]|[^。！？!?\n]+/g) ?? [];
  const out: string[] = [];
  for (const s of sentences) {
    const t = s.trim();
    if (Array.from(t).length < 6) continue; // 短すぎる断片は癖として意味がない
    if (!after.includes(norm(t))) out.push(t);
  }
  return out;
}

/**
 * 直した投稿の一覧から、生成プロンプトに足す「好み」の一節を作る。
 * 材料が無ければ空文字（プロンプトを汚さない）。
 */
export function buildPreferenceNote(edits: PostEdit[]): string {
  const usable = edits.filter((e) => String(e.postContent || "").trim().length >= 20);
  if (usable.length === 0) return "";

  const samples = usable
    .slice(0, PREFERENCE_SAMPLE_LIMIT)
    .map((e) => String(e.postContent).trim());

  const avoid: string[] = [];
  for (const e of usable) {
    for (const p of removedPhrases(e)) {
      if (avoid.length >= AVOID_LIMIT) break;
      if (!avoid.some((a) => norm(a) === norm(p))) avoid.push(p);
    }
  }

  let note =
    "\n\n【★このお客様が実際に手直しした文（最優先で寄せる）】\n" +
    "以下は、AIが作った文をお客様がご自分で書き直したものです。この人が「これなら出してよい」と\n" +
    "判断した文なので、言葉遣い・文の長さ・改行・絵文字の量を、ここに強く寄せてください。\n" +
    "内容（事実）は入力情報に従い、書き方だけを真似てください。\n---\n" +
    samples.join("\n---\n") +
    "\n---";

  if (avoid.length > 0) {
    note +=
      "\n\n【★お客様が消した言い回し（使わない）】\n" +
      "以下は、お客様が手直しのときに削られた文です。好まれていないので、同じ言い方はしないでください。\n" +
      avoid.map((a) => `・${a}`).join("\n");
  }
  return note;
}

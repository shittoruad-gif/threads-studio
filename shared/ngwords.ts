/**
 * NGワード（投稿に入れたくない言葉）のパースと、生成結果からの確定除去。
 *
 * 方針:
 * - プロンプトで「使わないで」と指示する（ソフト）だけでは100%保証できないため、
 *   生成後に本ファイルの applyNgWordFilter で機械的に除去し「必ず含めない」を担保する。
 */

/** 改行・読点・カンマ区切りのraw文字列を、NGワード配列に正規化する */
export function parseNgWords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      String(raw)
        .split(/[\n,、,]+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 0),
    ),
  );
}

/** 正規表現の特殊文字をエスケープ */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * テキストからNGワードを除去する（大文字小文字を区別しない）。
 * 除去後に生じる二重スペース・行頭行末の空白・記号前の空白などを軽く整える。
 */
export function stripNgWords(text: string, ngWords: string[]): string {
  if (!text || ngWords.length === 0) return text;
  let out = text;
  for (const w of ngWords) {
    if (!w) continue;
    const re = new RegExp(escapeRegExp(w), "gi");
    out = out.replace(re, "");
  }
  // 後処理: 連続スペース・約物前の余分なスペースなどを整える
  out = out
    .replace(/[ \t　]{2,}/g, " ")
    .replace(/[ \t　]+([、。!?！？,.])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t　]+\n/g, "\n")
    .replace(/\n[ \t　]+/g, "\n");
  return out.trim();
}

/** テキストにNGワードが含まれるか */
export function containsNgWord(text: string | null | undefined, ngWords: string[]): boolean {
  if (!text || ngWords.length === 0) return false;
  const lower = text.toLowerCase();
  return ngWords.some((w) => w && lower.includes(w.toLowerCase()));
}

type GeneratedPostLike = {
  title?: string;
  mainPost?: string;
  treePosts?: string[];
  cta?: string;
  [k: string]: any;
};

/**
 * 生成結果（title / mainPost / treePosts / cta）からNGワードを確定除去する。
 * 元オブジェクトは変更せず、除去済みの新しいオブジェクトを返す。
 */
export function applyNgWordFilter<T extends GeneratedPostLike>(result: T, ngWords: string[]): T {
  if (!result || ngWords.length === 0) return result;
  const cleaned: T = { ...result };
  if (typeof cleaned.title === "string") cleaned.title = stripNgWords(cleaned.title, ngWords);
  if (typeof cleaned.mainPost === "string") cleaned.mainPost = stripNgWords(cleaned.mainPost, ngWords);
  if (typeof cleaned.cta === "string") cleaned.cta = stripNgWords(cleaned.cta, ngWords);
  if (Array.isArray(cleaned.treePosts)) {
    cleaned.treePosts = cleaned.treePosts.map((t) =>
      typeof t === "string" ? stripNgWords(t, ngWords) : t,
    );
  }
  return cleaned;
}

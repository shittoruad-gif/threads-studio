/**
 * 少し前に公開した投稿と「ほぼ同じ文」になっていないか（2026-10-16 夜間整備）。
 *
 * ★きっかけ：acc22 プレステージ様が 10/16 の案「プレステージでは未経験で入社した方が8割以上。制服を貸与します…」を見送った。
 *   10/11 に公開した投稿とほぼ同じ文（似ている度0.88）。同じ言い回しの点検は直近10本しか見ないため、
 *   1日3本の方では3〜4日より前の投稿と同じ文を書いても通っていた。
 *   本番の直近30日（2,230本）で、直近10本より前の投稿と似ている度0.7以上は10本。うち3本は一字一句同じで、
 *   どれも「ご本人が手直しした投稿」（手直しのお手本として生成に渡している）をAIがそのまま写したもの
 *   （acc18 #3448←#2916、acc31 #3744←#2898、acc22 #1623←#1355）。
 *
 * 文字の2文字のかたまりの重なり（shared/postMatch.ts bigramSimilarity）で比べる。
 * 0.55〜0.65 は「同じ話題を別の言葉で書いた」程度（学習用アカウントに多い）なので止めない。
 */
import { bigramSimilarity, normalizeForMatch } from "./postMatch";

export const OLD_POST_COPY = {
  /** これ以上で作り直し */
  similarity: 0.7,
  /** 最後の作り直しでも、これ以上（ほぼ一字一句同じ）なら公開しない */
  dropOnLastAttempt: 0.85,
  /** 何日前までの投稿と比べるか */
  days: 45,
  /** 短い投稿は言い回しが重なりやすいので比べない */
  minChars: 40,
} as const;

export interface OlderPost { content: string; at: Date | string | null }
export interface OldPostCopy { content: string; at: Date | string | null; score: number }

/** いちばん似ている過去の投稿（基準以上のもの）。無ければ null */
export function findOldPostCopy(text: string, older: readonly OlderPost[]): OldPostCopy | null {
  const n = Array.from(normalizeForMatch(text)).length;
  if (n < OLD_POST_COPY.minChars) return null;
  let best: OldPostCopy | null = null;
  for (const p of older) {
    const body = String(p.content ?? "");
    if (Array.from(normalizeForMatch(body)).length < OLD_POST_COPY.minChars) continue;
    const score = bigramSimilarity(text, body);
    if (score >= OLD_POST_COPY.similarity && (!best || score > best.score)) best = { content: body, at: p.at, score };
  }
  return best;
}

function mdOf(at: Date | string | null): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  // 日本時間の月日
  const j = new Date(d.getTime() + 9 * 3600_000);
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()}の`;
}

/** 作り直しへ渡す指示 */
export function oldPostCopyHint(m: OldPostCopy): string {
  const head = m.content.replace(/\s+/g, " ").slice(0, 60);
  return `- ${mdOf(m.at)}投稿「${head}…」とほぼ同じ文になっている（読んだ人には同じ投稿に見える）。` +
    `お手本や過去の投稿の文を写さず、別の場面・別の入り方・別の言葉で書く。同じ事実を使うなら1つだけにし、ほかは別の材料にする。`;
}

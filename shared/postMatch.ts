/**
 * LINEに送られた文章が、その方の投稿を「直したもの」かどうか（2026-10-08 プレステージ様：
 * 投稿カードの本文をコピーして1行目を直し、ボタンを押さずに送り返された。頭の30字の一致で見ていたため気づけず、
 * 「投稿の材料」として預かってしまい、投稿は直す前の文のまま公開された）。
 *
 * 文字の2文字のかたまり（バイグラム）の重なりで比べる。1〜2文を直した程度なら0.6以上になる。
 */
export const PASTED_EDIT_MIN_SIMILARITY = 0.55;

export function normalizeForMatch(s: string): string {
  return String(s || "").replace(/\s+/g, "").replace(/[「」『』（）()【】…・]/g, "");
}

export function bigramSimilarity(a: string, b: string): number {
  const x = Array.from(normalizeForMatch(a)), y = Array.from(normalizeForMatch(b));
  if (x.length < 2 || y.length < 2) return 0;
  const grams = (arr: string[]) => {
    const m = new Map<string, number>();
    for (let i = 0; i + 1 < arr.length; i++) { const g = arr[i] + arr[i + 1]; m.set(g, (m.get(g) ?? 0) + 1); }
    return m;
  };
  const gx = grams(x), gy = grams(y);
  let inter = 0;
  for (const [g, n] of Array.from(gx.entries())) inter += Math.min(n, gy.get(g) ?? 0);
  return (2 * inter) / (x.length - 1 + y.length - 1);
}

/** いちばん似ている投稿（基準以上・長さが半分〜2倍のもの）。無ければ null */
export function bestPastedMatch<T extends { postContent?: string | null }>(text: string, posts: readonly T[]): { post: T; score: number; identical: boolean } | null {
  const n = Array.from(normalizeForMatch(text)).length;
  if (n < 20) return null;
  let best: { post: T; score: number; identical: boolean } | null = null;
  for (const p of posts) {
    const body = String(p.postContent || "");
    const m = Array.from(normalizeForMatch(body)).length;
    if (m < 20 || n > m * 2 || m > n * 2) continue;
    const score = bigramSimilarity(text, body);
    if (score >= PASTED_EDIT_MIN_SIMILARITY && (!best || score > best.score)) {
      best = { post: p, score, identical: normalizeForMatch(text) === normalizeForMatch(body) };
    }
  }
  return best;
}

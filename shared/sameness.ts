/**
 * 「形が似た投稿ばかり」を数える（2026-11-19 三上様「ネタ切れで同じような投稿ばかりというのが増えてくると思うので、
 * このようなことにならないようにできる仕組みを早急に作って」）。
 *
 * きっかけ（11/19 実測・直近14日の自動の投稿・20アカウント）：
 *  - 既存の見張り（M1〜M3）は「まったく同じ文・同じ書き出し」しか数えない。ご本人が書いた文は数えない。
 *    そのため「悩みを言う→当店では寄り添い…」の同じ形が毎日続いていた呉服店のアカウントを、同じ文3本としか見ていなかった。
 *  - 文字2つ組の重なり（0〜1）で比べると、そのアカウントだけ「ほかの投稿と0.5以上似ている投稿」が28%。ほかは0〜8%。
 *  - 原因は生成の工夫ではなく材料の不足（ネタ帳が題名だけの話題10件・中身のある話が0件）。
 *
 * ここは数えるだけ（純粋な関数）。数字は shared/repetitionRules.ts の similar が唯一の正。
 *   R6 … 生成の指示に「何度も使った言い回しを今日は使わない」を足す（作り直しはしない＝枠を減らさない）
 *   M4 … 週次の見張りに「似た投稿の割合」を足す。超えたアカウントは毎朝のネタの補充（server/materialHarvest.ts）の対象
 */

import { REPETITION_RULES as R } from './repetitionRules';

const DECOR_RE = new RegExp('[\\p{Extended_Pictographic}\\uFE0F\\u200D\\s　]', 'gu');

/** 比べる前の形：空白・改行・絵文字を外す */
export function samenessKey(text: string | null | undefined): string {
  return String(text ?? '').replace(DECOR_RE, '');
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** 2つの文章の似ている度（文字2つ組の重なり・0〜1） */
export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  const x = bigrams(samenessKey(a));
  const y = bigrams(samenessKey(b));
  if (x.size === 0 || y.size === 0) return 0;
  let n = 0;
  x.forEach((k) => { if (y.has(k)) n++; });
  return n / (x.size + y.size - n);
}

export interface SamenessMetrics {
  posts: number;
  /** ほかの投稿のどれかと score 以上似ている投稿の割合（0〜1） */
  similarShare: number;
  /** いちばん似ている2本（見せる用） */
  worst: { a: string; b: string; score: number } | null;
  flagged: boolean;
}

/** 似た投稿の割合を数える。posts の並びは問わない */
export function measureSameness(posts: readonly (string | null | undefined)[]): SamenessMetrics {
  const docs = posts.map((p) => String(p ?? '')).filter((p) => samenessKey(p).length >= 10);
  if (docs.length < R.similar.minPosts) return { posts: docs.length, similarShare: 0, worst: null, flagged: false };
  const sets = docs.map((d) => bigrams(samenessKey(d)));
  let hit = 0;
  let worst: SamenessMetrics['worst'] = null;
  for (let i = 0; i < sets.length; i++) {
    let max = 0;
    for (let j = 0; j < sets.length; j++) {
      if (i === j) continue;
      let n = 0;
      sets[i].forEach((k) => { if (sets[j].has(k)) n++; });
      const s = n / (sets[i].size + sets[j].size - n || 1);
      if (s > max) max = s;
      if (!worst || s > worst.score) worst = { a: docs[i], b: docs[j], score: +s.toFixed(2) };
    }
    if (max >= R.similar.score) hit++;
  }
  const share = +(hit / docs.length).toFixed(2);
  return { posts: docs.length, similarShare: share, worst, flagged: share >= R.similar.share };
}

/**
 * 何度も使っている言い回し（6文字以上・直近の投稿の phraseShare 以上）。
 *   protect … 毎回出てよい言葉（店名・地名など）。外して4文字未満しか残らない言い回しは数えない
 *   ownerTexts … ご本人の手直し・お手本。その半分以上（3本以上）に出ている言い回しは、ご本人が毎回書くものなので数えない
 */
export function overusedPhrases(
  posts: readonly (string | null | undefined)[],
  protect: readonly (string | null | undefined)[] = [],
  ownerTexts: readonly (string | null | undefined)[] = [],
  max: number = 4,
): string[] {
  const docs = posts.map(samenessKey).filter((p) => p.length >= 10);
  const need = Math.max(R.similar.phraseMin, Math.ceil(docs.length * R.similar.phraseShare));
  if (docs.length < need) return [];
  const L = R.similar.phraseLen;
  const df = new Map<string, number>();
  for (const d of docs) {
    const seen = new Set<string>();
    for (let i = 0; i + L <= d.length; i++) seen.add(d.slice(i, i + L));
    seen.forEach((k) => df.set(k, (df.get(k) ?? 0) + 1));
  }
  const frequent = new Set<string>();
  df.forEach((n, k) => { if (n >= need) frequent.add(k); });
  if (frequent.size === 0) return [];
  // 続いている所をつないで、長い言い回しにする
  const cands = new Set<string>(frequent);
  for (const d of docs) {
    let start = -1;
    for (let i = 0; i + L <= d.length + 1; i++) {
      const on = i + L <= d.length && frequent.has(d.slice(i, i + L));
      if (on && start < 0) start = i;
      if (!on && start >= 0) { cands.add(d.slice(start, i - 1 + L)); start = -1; }
    }
  }
  const prot = protect.map(samenessKey).filter((p) => p.length >= 2);
  const owner = ownerTexts.map(samenessKey).filter((p) => p.length >= 10);
  const strip = (s: string) => prot.reduce((acc, p) => acc.split(p).join(''), s).replace(/^[、。，．・「」（）()！？!?]+|[、。，．・「」（）()！？!?]+$/g, '');
  const kept: string[] = [];
  const sorted = Array.from(cands)
    .map((c) => c.replace(/^[、。，．・」）)！？!?]+/, ''))
    .filter((c) => c.length >= L)
    .sort((a, b) => b.length - a.length);
  for (const c of sorted) {
    if (kept.some((k) => k.includes(c))) continue;
    if (docs.filter((d) => d.includes(c)).length < need) continue;
    if (strip(c).length < 4) continue;
    if (owner.length >= 3 && owner.filter((o) => o.includes(c)).length * 2 >= owner.length) continue;
    kept.push(c);
  }
  return kept
    .map((c) => ({ c, n: docs.filter((d) => d.includes(c)).length }))
    .sort((a, b) => b.n - a.n || b.c.length - a.c.length)
    .slice(0, max)
    .map((x) => x.c);
}

/**
 * R6：直近の投稿どうしが似てきているときだけ、生成の指示に足す。似ていなければ空文字（何も変えない）。
 * 作り直しの条件にはしない（材料が薄い方は作り直しても同じ所に戻り、枠が減るだけだったため）。
 */
export function buildSamenessNote(
  recentPosts: readonly (string | null | undefined)[],
  protect: readonly (string | null | undefined)[] = [],
  ownerTexts: readonly (string | null | undefined)[] = [],
): string {
  const recent = recentPosts.slice(0, R.similar.window);
  const m = measureSameness(recent);
  if (!m.flagged) return '';
  const phrases = overusedPhrases(recent, protect, ownerTexts);
  return `\n\n【★直近の投稿どうしが似てきています（同じ形の投稿を続けない・厳守）】\n`
    + (phrases.length > 0 ? `- 直近の投稿で何度も使った言い回し：${phrases.map((p) => `「${p}」`).join('')}。今日はこの言い回しを使わない（少し変えただけの言い方もしない）。\n` : '')
    + `- 直近の投稿と、話の順番を変える。「悩みを言う→当店では…と受ける」の同じ順番を続けない。\n`
    + `- 今日の材料にある具体的な事実（物の名前・場面・お客様の言葉・数字）を主役にして書く。どの店でも言える一般的な言葉だけで1本にしない。`;
}

/**
 * 「同じ投稿ばかり」に見える原因の見張り（2026-10-05 三上様「同じ投稿ばかりになっていたりするので、きちんと改善して」）。
 *
 * 10/5 実測（直近14日・自動の投稿）：
 *  - 文字の重なり（4文字のかたまり）で見ると、似た組はどのアカウントも0。文面の使い回しは少ない。
 *  - 一方で「同じ言葉・同じ書き出し・同じ文」が繰り返されていた：
 *      書き出し「ハイサイ♪はいさい整骨院の比嘉です(^^)」が55本中15本／「ダイエットコーチとして10年。」が5本／
 *      「金沢市」95%・「プレステージ」97%・「岐阜市」91%・1行目が地名・店名から始まる投稿が続く。
 *  - 既存の重複検査（findRepeatedPhrase）は店名・地名・実績の数字を外してから比べるため、
 *    それらを含む文が丸ごと繰り返されても通っていた。
 * ここでは「書き出し」「同じ文」「1行目の地名・店名」を、外さずにそのまま比べる。
 */

import { REPETITION_RULES as R, GENERIC_TOPIC_WORDS } from './repetitionRules';

const norm = (s: string) => String(s || '').replace(/[\s　]/g, '');

/** 1行目（空行を除く最初の行）の頭12文字 */
export function openingKey(text: string): string {
  const first = String(text || '').split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return norm(first).slice(0, R.opening.chars);
}

/**
 * ご本人が自分で書いた文（手直しした投稿・文体のお手本）に入っている書き出し・文は、ご本人の好みなので止めない。
 * ★10/5 比嘉様：「ハイサイ♪はいさい整骨院の比嘉です(^^)」は、ご本人が手直しで書き足していた（直した76本中16本）。
 */
export function ownerKeys(ownerTexts: readonly string[]): { openings: Set<string>; sentences: Set<string> } {
  const openings = new Set<string>();
  const sentences = new Set<string>();
  for (const t of ownerTexts) {
    const k = openingKey(t);
    if (k) openings.add(k);
    for (const s of sentencesOf(t, R.sentence.minLen)) sentences.add(s);
  }
  return { openings, sentences };
}

/** 書き出しが、直近 window 本のうち min 本以上と同じか */
export function repeatedOpening(text: string, recent: readonly string[], opts: { window?: number; min?: number; owner?: { openings: Set<string> } } = {}): string | null {
  const key = openingKey(text);
  if (Array.from(key).length < 6) return null;
  if (opts.owner?.openings.has(key)) return null;
  const n = recent.slice(0, opts.window ?? R.opening.window).filter((r) => openingKey(r) === key).length;
  return n >= (opts.min ?? R.opening.min) ? key : null;
}

function sentencesOf(text: string, minLen: number): string[] {
  return Array.from(new Set(String(text || '').split(/(?<=[。！？!?\n])/).map(norm).filter((s) => Array.from(s).length >= minLen)));
}

/** この下書きの文のうち、直近 window 本のうち min 本以上にまったく同じ文があるもの */
export function repeatedSentences(text: string, recent: readonly string[], opts: { window?: number; min?: number; minLen?: number; owner?: { sentences: Set<string> } } = {}): string[] {
  const minLen = opts.minLen ?? R.sentence.minLen;
  const pool = recent.slice(0, opts.window ?? R.sentence.window).map((r) => new Set(sentencesOf(r, minLen)));
  return sentencesOf(text, minLen)
    .filter((s) => !opts.owner?.sentences.has(s))
    .filter((s) => pool.filter((p) => p.has(s)).length >= (opts.min ?? R.sentence.min));
}

/** 1行目に地名・店名などの「この店を指す言葉」が入っているか */
export function identityInFirstLine(text: string, tokens: readonly string[]): boolean {
  const first = norm(String(text || '').split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? '');
  return tokens.some((t) => t && Array.from(norm(t)).length >= 2 && first.includes(norm(t)));
}

/** 直近3本のうち2本以上が、1行目に地名・店名を入れて始まっているか（＝今回は1行目に入れない） */
export function identityOpeningStreak(recent: readonly string[], tokens: readonly string[]): boolean {
  return recent.slice(0, R.identityFirstLine.window).filter((r) => identityInFirstLine(r, tokens)).length >= R.identityFirstLine.min;
}

/** 書き出し・同じ文・1行目の地名をまとめて、生成の指示に足す文 */
export function buildRepetitionNote(recent: readonly string[], tokens: readonly string[], owner?: { openings: Set<string>; sentences: Set<string> }): string {
  const lines: string[] = [];
  const opens = Array.from(new Set(recent.slice(0, R.opening.window)
    .filter((r) => !owner?.openings.has(openingKey(r)))
    .map((r) => {
      const first = String(r || '').split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? '';
      return first.slice(0, 20);
    }).filter((s) => Array.from(s).length >= 6)));
  if (opens.length > 0) lines.push(`- 直近の投稿の書き出し（${opens.map((o) => `「${o}…」`).join('')}）と同じ・似た書き出しにしない。あいさつや自己紹介の決まり文句から毎回始めない。`);
  // 直近6本のうち2本以上で使われている同じ文
  const counts = new Map<string, number>();
  for (const r of recent.slice(0, R.sentence.window)) for (const s of sentencesOf(r, R.sentence.minLen)) counts.set(s, (counts.get(s) ?? 0) + 1);
  const rep = Array.from(counts.entries()).filter(([s, n]) => n >= R.sentence.min && !owner?.sentences.has(s)).map(([s]) => s).slice(0, 4);
  if (rep.length > 0) lines.push(`- 次の文は直近で何度も使っているので、今回は使わない（言い換えて同じことを言うのも避ける）：${rep.map((s) => `「${s.slice(0, 30)}」`).join('')}`);
  if (identityOpeningStreak(recent, tokens)) lines.push('- 直近の投稿が続けて地名・店名から始まっている。今回は1行目に地名・店名を入れない（入れるなら2行目以降に1回だけ）。');
  return lines.length > 0 ? `\n\n【同じ投稿に見せない（厳守）】\n${lines.join('\n')}` : '';
}

/**
 * R3 の最後の作り直し：繰り返している文を外す。外すと keepAtLeast 字未満になるなら null（＝外さずに出す）。
 */
export function removeRepeatedSentences(text: string, repeated: readonly string[]): string | null {
  if (repeated.length === 0) return text;
  const set = new Set(repeated);
  const out = String(text || '').split(/\n{2,}/)
    .map((p) => p.split(/(?<=[。！？!?\n])/).filter((s) => !set.has(norm(s))).join('').trim())
    .filter(Boolean).join('\n\n').trim();
  return Array.from(norm(out)).length >= R.sentence.keepAtLeast ? out : null;
}

export interface RepetitionMetrics {
  posts: number;
  /** 直近の投稿の topicShare 以上に出ている言葉（毎回出てよい言葉を除く） */
  topicWords: Array<{ word: string; share: number }>;
  /** 同じ書き出しが sameOpening 本以上 */
  sameOpenings: Array<{ opening: string; count: number }>;
  /** 同じ文が sameSentence 本以上 */
  sameSentences: Array<{ sentence: string; count: number }>;
  flagged: boolean;
}

/**
 * 週次の見張り（M1〜M3）。posts は新しい順でなくてよい。protect は毎回出てよい言葉（店名・地名・業種・対象のお客様）。
 */
export function measureRepetition(posts: readonly string[], protect: readonly (string | null | undefined)[], ownerTexts: readonly string[] = []): RepetitionMetrics {
  const M = R.monitor;
  const owner = ownerKeys(ownerTexts);
  const docs = posts.map((p) => String(p || '')).filter((p) => norm(p).length >= 10);
  const empty: RepetitionMetrics = { posts: docs.length, topicWords: [], sameOpenings: [], sameSentences: [], flagged: false };
  if (docs.length < M.minPosts) return empty;
  const prot = protect.map((p) => norm(String(p || ''))).filter((p) => p.length >= 2);
  const isProtected = (w: string) => prot.some((p) => p.includes(w) || w.includes(p))
    || GENERIC_TOPIC_WORDS.some((g) => g === w || (g.length >= 2 && w.length <= g.length + 1 && w.includes(g)));
  // M1：漢字・カタカナの2〜8文字の言葉
  const df = new Map<string, number>();
  for (const d of docs) for (const w of Array.from(new Set(norm(d).match(/[一-龥々ァ-ヴー]{2,8}/g) ?? []))) df.set(w, (df.get(w) ?? 0) + 1);
  const topicWords = Array.from(df.entries())
    .filter(([w, n]) => !isProtected(w) && n / docs.length >= M.topicShare)
    .sort((a, b) => b[1] - a[1])
    .filter(([w], i, arr) => !arr.slice(0, i).some(([o]) => o.includes(w) || w.includes(o)))
    .slice(0, 6).map(([word, n]) => ({ word, share: +(n / docs.length).toFixed(2) }));
  // M2
  const oc = new Map<string, number>();
  for (const d of docs) { const k = openingKey(d); if (Array.from(k).length >= 6 && !owner.openings.has(k)) oc.set(k, (oc.get(k) ?? 0) + 1); }
  const sameOpenings = Array.from(oc.entries()).filter(([, n]) => n >= M.sameOpening).sort((a, b) => b[1] - a[1]).map(([opening, count]) => ({ opening, count }));
  // M3
  const sc = new Map<string, number>();
  for (const d of docs) for (const s of sentencesOf(d, R.sentence.minLen)) if (!owner.sentences.has(s)) sc.set(s, (sc.get(s) ?? 0) + 1);
  const sameSentences = Array.from(sc.entries()).filter(([, n]) => n >= M.sameSentence).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([sentence, count]) => ({ sentence, count }));
  return { posts: docs.length, topicWords, sameOpenings, sameSentences, flagged: topicWords.length > 0 || sameOpenings.length > 0 || sameSentences.length > 0 };
}

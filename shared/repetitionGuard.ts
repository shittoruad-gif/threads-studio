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

const norm = (s: string) => String(s || '').replace(/[\s　]/g, '');

/** 1行目（空行を除く最初の行）の頭12文字 */
export function openingKey(text: string): string {
  const first = String(text || '').split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return norm(first).slice(0, 12);
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
    for (const s of sentencesOf(t, 8)) sentences.add(s);
  }
  return { openings, sentences };
}

/** 書き出しが、直近 window 本のうち min 本以上と同じか */
export function repeatedOpening(text: string, recent: readonly string[], opts: { window?: number; min?: number; owner?: { openings: Set<string> } } = {}): string | null {
  const key = openingKey(text);
  if (Array.from(key).length < 6) return null;
  if (opts.owner?.openings.has(key)) return null;
  const n = recent.slice(0, opts.window ?? 5).filter((r) => openingKey(r) === key).length;
  return n >= (opts.min ?? 2) ? key : null;
}

function sentencesOf(text: string, minLen: number): string[] {
  return Array.from(new Set(String(text || '').split(/(?<=[。！？!?\n])/).map(norm).filter((s) => Array.from(s).length >= minLen)));
}

/** この下書きの文のうち、直近 window 本のうち min 本以上にまったく同じ文があるもの */
export function repeatedSentences(text: string, recent: readonly string[], opts: { window?: number; min?: number; minLen?: number; owner?: { sentences: Set<string> } } = {}): string[] {
  const minLen = opts.minLen ?? 8;
  const pool = recent.slice(0, opts.window ?? 6).map((r) => new Set(sentencesOf(r, minLen)));
  return sentencesOf(text, minLen)
    .filter((s) => !opts.owner?.sentences.has(s))
    .filter((s) => pool.filter((p) => p.has(s)).length >= (opts.min ?? 2));
}

/** 1行目に地名・店名などの「この店を指す言葉」が入っているか */
export function identityInFirstLine(text: string, tokens: readonly string[]): boolean {
  const first = norm(String(text || '').split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? '');
  return tokens.some((t) => t && Array.from(norm(t)).length >= 2 && first.includes(norm(t)));
}

/** 直近3本のうち2本以上が、1行目に地名・店名を入れて始まっているか（＝今回は1行目に入れない） */
export function identityOpeningStreak(recent: readonly string[], tokens: readonly string[]): boolean {
  return recent.slice(0, 3).filter((r) => identityInFirstLine(r, tokens)).length >= 2;
}

/** 書き出し・同じ文・1行目の地名をまとめて、生成の指示に足す文 */
export function buildRepetitionNote(recent: readonly string[], tokens: readonly string[], owner?: { openings: Set<string>; sentences: Set<string> }): string {
  const lines: string[] = [];
  const opens = Array.from(new Set(recent.slice(0, 5)
    .filter((r) => !owner?.openings.has(openingKey(r)))
    .map((r) => {
      const first = String(r || '').split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? '';
      return first.slice(0, 20);
    }).filter((s) => Array.from(s).length >= 6)));
  if (opens.length > 0) lines.push(`- 直近の投稿の書き出し（${opens.map((o) => `「${o}…」`).join('')}）と同じ・似た書き出しにしない。あいさつや自己紹介の決まり文句から毎回始めない。`);
  // 直近6本のうち2本以上で使われている同じ文
  const counts = new Map<string, number>();
  for (const r of recent.slice(0, 6)) for (const s of sentencesOf(r, 8)) counts.set(s, (counts.get(s) ?? 0) + 1);
  const rep = Array.from(counts.entries()).filter(([s, n]) => n >= 2 && !owner?.sentences.has(s)).map(([s]) => s).slice(0, 4);
  if (rep.length > 0) lines.push(`- 次の文は直近で何度も使っているので、今回は使わない（言い換えて同じことを言うのも避ける）：${rep.map((s) => `「${s.slice(0, 30)}」`).join('')}`);
  if (identityOpeningStreak(recent, tokens)) lines.push('- 直近の投稿が続けて地名・店名から始まっている。今回は1行目に地名・店名を入れない（入れるなら2行目以降に1回だけ）。');
  return lines.length > 0 ? `\n\n【同じ投稿に見せない（厳守）】\n${lines.join('\n')}` : '';
}

/**
 * アカウントごとの書き方の決まり（自社の学習用アカウントだけ・お客様のアカウントには入れない）。
 *
 * 2026-11-24 三上様「直して」：acc12 の BEST3 のツリー（11/23・表示23）が
 *   - 「第3位は、」で切って次の段でまた「第3位」と書く機械的な形（機械的なツリーはふつうの約0.8倍）
 *   - 中身が題とずれる（猫背の題に「スマホを同じ腕で持つ」）
 *   - 9/2・9/4 とほぼ同じ題（「猫背を悪化させる習慣3つ」）
 *   - 体の話に 😅
 * だった。決めゼリフ・決まり文句は shared/accountBannedWords.ts で止める。ここでは
 *   1. 書き方の指示（生成の指示の後ろに足す）
 *   2. ツリーの試しで使わない型（BEST3 を外す）
 *   3. 直近 repeatDays 日に出した投稿と1行目が重なっていたら作り直す（最後の1回は通す＝枠は空けない）
 * を持つ。
 */

export interface AccountStyle {
  note: string;
  /** ツリーの試し（shared/treeDesign.ts）で使わない型 */
  skipTreeKeys: readonly string[];
  /** 1行目の重なりを見る日数 */
  repeatDays: number;
}

export const ACCOUNT_STYLE: Readonly<Record<number, AccountStyle>> = {
  12: {
    note: `

【このアカウントの書き方の決まり（運営の方針）】
- 体・姿勢・施術の話には絵文字を付けない（地元の人に話しかける回だけは付けてよい）
- 題（1行目）と中身をずらさない。題が「猫背」なら、挙げることはすべて猫背に直接かかわることにする
- 最後の文は、この投稿の中身にしか当てはまらない一言にする。決めゼリフ・店の標語で締めない
- 「〇〇市でも〜な方が多い／よくいらっしゃる」のような、数えていない「よく・多く」は書かない`,
    skipTreeKeys: ["tree_rank"],
    repeatDays: 60,
  },
};

export function accountStyleFor(accountId: number | null | undefined): AccountStyle | null {
  if (accountId == null) return null;
  return ACCOUNT_STYLE[Number(accountId)] ?? null;
}

export function accountStyleNote(accountId: number | null | undefined): string {
  return accountStyleFor(accountId)?.note ?? "";
}

/** 重なりを比べるための1行目（空白・記号・絵文字を除く） */
export function topicLine(text: string | null | undefined): string {
  const first = String(text ?? "").replace(/\r/g, "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return first.replace(/[\s　、。，．,.!！?？…「」『』（）()・:：;；〜~ー－\-]/g, "").replace(/[\uD83C-\uD83E][\uDC00-\uDFFF]|[☀-➿]|️/g, "");
}

/** 2つの文字列の、いちばん長い共通の連続部分の長さ */
function longestCommonRun(a: string, b: string): number {
  const A = Array.from(a), B = Array.from(b);
  let best = 0;
  let prev = new Array(B.length + 1).fill(0);
  for (let i = 1; i <= A.length; i++) {
    const cur = new Array(B.length + 1).fill(0);
    for (let j = 1; j <= B.length; j++) {
      if (A[i - 1] === B[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

export const REPEAT_RUN = 10;

/**
 * 1行目が、過去の投稿の1行目と10字以上続けて同じなら、その過去の1行目を返す（重なりなし＝null）。
 * 例：「猫背を悪化させる習慣、実は日常に潜んでいます。」と 9/2「猫背を悪化させる習慣、意外と3つあります。」
 */
export function repeatedTopic(text: string, pastTexts: readonly string[]): string | null {
  const t = topicLine(text);
  if (Array.from(t).length < REPEAT_RUN) return null;
  for (const p of pastTexts) {
    const q = topicLine(p);
    if (q === "" || p === text) continue;
    if (longestCommonRun(t, q) >= REPEAT_RUN) {
      return String(p).replace(/\r/g, "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? q;
    }
  }
  return null;
}

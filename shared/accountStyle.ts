/**
 * アカウントごとの書き方の決まり（自社の学習用アカウントだけ・お客様のアカウントには入れない）。
 *
 * 2026-11-24 三上様「直して」（同日、玉島 acc10 にも）：acc12 の BEST3 のツリー（11/23・表示23）が
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

const MOVEACT_STYLE: AccountStyle = {
  note: `

【このアカウントの書き方の決まり（運営の方針）】
- 体・姿勢・施術の話には絵文字を付けない（地元の人に話しかける回だけは付けてよい）
- 題（1行目）と中身をずらさない。題が「猫背」なら、挙げることはすべて猫背に直接かかわることにする
- 最後の文は、この投稿の中身にしか当てはまらない一言にする。決めゼリフ・店の標語で締めない
- 「〇〇市でも〜な方が多い／よくいらっしゃる」のような、数えていない「よく・多く」は書かない`,
  skipTreeKeys: ["tree_rank"],
  repeatDays: 60,
};

// 12＝金光（11/24）、10＝玉島（11/24 三上様「玉島にも同じ直しを入れて」）。
// 玉島は 12/07 まで回復期間の指示（shared/accountRecovery.ts・絵文字なし・ツリーの試しに入れない）も重なる
export const ACCOUNT_STYLE: Readonly<Record<number, AccountStyle>> = {
  10: MOVEACT_STYLE,
  12: MOVEACT_STYLE,
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

/**
 * 2026-11-26 三上様「なんで勝手に過去のngにしたやつとか出てくるの？」→「進めて」。
 * 自社の学習用アカウント（ACCOUNT_STYLE にあるもの）は、枠より中身を優先する：
 *  - 書かない題・回復期間の宣伝の文・1行目の重なりは、最後の作り直しでも通さない
 *  - 3回で書けなければ、地元への問いかけ（local_talk）で作り直す。それでも書けなければその枠は出さない
 *    （保証パス＝承認カードにも回さない）
 */
export function strictAccount(accountId: number | null | undefined): boolean {
  return accountStyleFor(accountId) !== null;
}

/**
 * 自社アカウントで使わない当たり型（hitPatterns.id）。11/26 玉島で NG の形をそのまま呼び戻していた：
 *  21＝季節の不調で書き出す（→「朝晩の冷え込み」）、59＝自分の店の良さで締める（→宣伝の文）、
 *  105＝よくある質問を「」で出す（→「体が硬いからピラティスは無理」）
 */
export const STRICT_BLOCKED_HIT_PATTERNS: readonly number[] = [21, 59, 105];

/** アカウントごとに当分使わない題（本文のどこにあっても作り直し） */
const ACCOUNT_BANNED_TOPICS: Readonly<Record<number, ReadonlyArray<{ re: RegExp; label: string }>>> = {
  // 玉島：7月から30回以上出ている題（11/26 三上様）
  10: [{ re: /体が硬い[^。\n]{0,8}ピラティス[^。\n]{0,4}無理/, label: "体が硬いからピラティスは無理" }],
};

export function bannedTopicHit(accountId: number | null | undefined, text: string): string | null {
  if (accountId == null) return null;
  for (const t of ACCOUNT_BANNED_TOPICS[Number(accountId)] ?? []) if (t.re.test(String(text ?? ""))) return t.label;
  return null;
}

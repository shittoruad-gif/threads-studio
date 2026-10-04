/**
 * 自然な書き方モード（2026-10-03 三上様「全部進めて」・香取様の度重なるご指摘への対応）
 *
 * 事実（香取様の直近29本・2026-10-03 確認）：
 *  - 「土浦」が29本すべてに入っていた／12本が「？」で終わっていた／決まり文句（根本・その場しのぎ等）が8本
 *  - 共通の最終指示（AUTO_POST_STYLE_ADDENDUM）の「1行目に数字」「絵文字1〜3個」「1文30字・1文1行」が、
 *    お手本（平均141字・話し言葉のつながった文章）と正反対の形を作っていた
 * 試作（同じ5話題・2026-10-03）：改善した指示＋gemini-3.8-flash が、長さ・地名・決まり文句・数字始まりの4点で最も良かった。
 *
 * 対象は下の一覧のお客様だけ（全員に広げるかは、反映後の実物を見て決める）。
 */

/** 対象のお客様（users.id）。3500 = 香取様 */
export const NATURAL_STYLE_USER_IDS: readonly number[] = [3500];

/** このモードで本文の生成に使うモデル。失敗したら invokeLLM が既定のモデルでやり直す */
export const NATURAL_STYLE_MODEL = 'gemini-3.8-flash';

/** 使わない決まり文句（どの院でも言える言葉。香取様の投稿で目立っていたもの） */
export const NATURAL_STYLE_CLICHES: readonly string[] = [
  '根本から', '根本的', '根本原因', 'その場しのぎ', '揉むだけ', '繰り返す', '再発しない', '帰り道は楽に',
];

export function isNaturalStyleUser(userId: number | null | undefined): boolean {
  return typeof userId === 'number' && NATURAL_STYLE_USER_IDS.includes(userId);
}

/** 本文に残っている決まり文句 */
export function findCliches(text: string): string[] {
  const t = String(text || '');
  return NATURAL_STYLE_CLICHES.filter((w) => t.includes(w));
}

/**
 * 共通の最終指示の代わりに付ける指示。
 * 長さは呼び出し側の【今回の長さ】で渡す（ここには書かない）。
 */
export function naturalStyleAddendum(opts: { allowEmoji: boolean }): string {
  return `

【最終指示（これまでの全指示より優先・厳守）】
★この方の「文体のお手本」の書き方（話し言葉のやわらかさ・改行の入れ方・慎重な言い回し・長さ）をよくまねる。お手本の文をそのまま写すのは禁止。
- 話の流れが切れない、ふつうの日本語の文章にする。単語や体言止めを並べただけの行にしない。1文ごとに機械的に改行しない（お手本と同じ改行の仕方にする）。
- 1行目を数字で始めない。「〜な人の共通点3つ」のような型は使わない。
- 地名は毎回入れない。入れるとしても1回まで。院名か地名のどちらか1つが入っていればよい。
- 最後を質問で終わらせない。言い切って終わる。
- 「${NATURAL_STYLE_CLICHES.join('」「')}」は使わない。
- 「実は」「正直」「ぶっちゃけ」「ちなみに」は使わない（人の投稿にはほぼ出ない言い回し）。
- 実績の数字（年数・症例数・人数）を書き足さない。登録にない料金・無料・保証・営業時間は書かない。
- 治る・良くなるなどの効果を約束しない。症例の話は、登録されている実際の話を1つだけ選び、登録にある事実の範囲で書く。登録にない出来事・気持ち・日付（「今日」「昨日」など）を作らない。
- ${opts.allowEmoji ? '絵文字は使っても1つまで。' : '絵文字は使わない。'}「！」も使っても1つまで。
- 宣伝口調・案内文口調（「ご案内します」「ぜひご利用ください」「〜がおすすめです」「〜してみませんか」）は使わない。`;
}

/**
 * 最後の問いかけ（「？」で終わる最後の文）を外す。外したあとが40字未満なら null（＝外さない）。
 */
export function dropTrailingQuestion(text: string): string | null {
  const t = String(text || '').trimEnd();
  // 最後の文＝最後の 。！？ の手前までをさかのぼる（改行も文の区切りとみなす）
  const m = t.match(/^([\s\S]*?[。！!？?\n])([^。！!？?\n]*[？?][\s️‍\uD800-\uDFFF☀-➿]*)$/);
  if (!m) return null;
  const rest = m[1].trimEnd();
  if (Array.from(rest.replace(/\s+/g, '')).length < 40) return null;
  return rest;
}

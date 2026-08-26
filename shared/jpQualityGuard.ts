/**
 * 日本語品質ガード（人間化リライトの安全弁）。
 *
 * 2026-08-26、自動投稿の日本語が壊れていると三上さんから指摘があった。
 * 実際の投稿12本を確認すると、人間化リライト（naturalizeContent）の指示が
 * 原因で、次の劣化が起きていた。
 *
 *   1. 「正直」が12本中5本に出る（プロンプトの「削らない」指示を
 *      モデルが「入れろ」と解釈した）
 *   2. プロンプト内のお手本「同じ悩みの方、いませんか？」がそのまま
 *      複数投稿にコピーされた
 *   3. 会話型でない投稿まで問いかけで締められた（リライトの締め指示が
 *      投稿タイプ別のルールを上書きした）
 *   4. ひらがなに開きすぎて幼い文になった
 *
 * リライトはベストエフォートで、失敗しても「リライト前の文」という
 * 安全な代替が常にある。だからこのガードは**書き直さない**。
 * 検査して不合格ならリライト前の文に戻すだけにする。
 * （機械で文章を直すと新しい不自然を作るため）
 */

/** リライト後の文に出たら不合格にする決まり文句（お手本のコピー・口癖） */
export const BANNED_TIC_PHRASES: readonly string[] = [
  // プロンプトのお手本がそのままコピーされていた実例
  '同じ悩みの方、いませんか',
  '同じ方いませんか',
  // 口癖化していた実例（1回なら自然だが、機械には判定できないので禁止に倒す。
  // 「正直」を本当に使いたい文はリライト前の文がそのまま生きる）
  '正直、',
];

/** 判定結果。ok=false のときは reason に人間が読める理由を入れる */
export interface QualityVerdict {
  ok: boolean;
  reason?: string;
}

/** ひらがな率を計算する（日本語文字のうちひらがなが占める割合） */
export function hiraganaRatio(text: string): number {
  let hira = 0;
  let jp = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const isHira = code >= 0x3041 && code <= 0x3096;
    const isKata = code >= 0x30a1 && code <= 0x30fa;
    const isKanji = (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf);
    if (isHira || isKata || isKanji) jp++;
    if (isHira) hira++;
  }
  if (jp === 0) return 0;
  return hira / jp;
}

/**
 * ひらがな率の上限。
 *
 * 自然な投稿（劣化前の実投稿・手書きコピー）を測ると 0.55〜0.70 に収まり、
 * 「ひらがなが多すぎて不自然」と指摘された投稿は 0.75 前後だった。
 * 境界の 0.72 を超えたら開きすぎと判定する。
 */
export const HIRAGANA_RATIO_MAX = 0.72;

/** 末尾が問いかけ（？/?）で終わっているか */
export function endsWithQuestion(text: string): boolean {
  const t = text.trim().replace(/[\s\u3002\uff01!\u2728\ud83d\ude0a\ud83d\udca6\ud83d\ude4c\ud83d\ude05]+$/, '');
  return /[？?]$/.test(t);
}

/**
 * リライト後の文を検査する。
 *
 * @param naturalized リライト後の文
 * @param original    リライト前の文（締めの形の照合に使う）
 * @param opts.allowQuestionEnding 会話型（問いかけ締めが許可された投稿タイプ）か
 */
export function checkNaturalized(
  naturalized: string,
  original: string,
  opts: { allowQuestionEnding: boolean },
): QualityVerdict {
  // 1. 決まり文句・お手本コピー
  for (const p of BANNED_TIC_PHRASES) {
    if (naturalized.includes(p)) {
      return { ok: false, reason: `決まり文句「${p}」が混入` };
    }
  }

  // 2. ひらがなに開きすぎ
  const ratio = hiraganaRatio(naturalized);
  if (ratio > HIRAGANA_RATIO_MAX) {
    return { ok: false, reason: `ひらがな率${(ratio * 100).toFixed(0)}%（上限${HIRAGANA_RATIO_MAX * 100}%）` };
  }

  // 3. 締めの形の書き換え：会話型でないのに、言い切りだった文を問いかけに変えた
  if (!opts.allowQuestionEnding && endsWithQuestion(naturalized) && !endsWithQuestion(original)) {
    return { ok: false, reason: '言い切りの締めを問いかけに書き換えた（会話型以外は禁止）' };
  }

  return { ok: true };
}

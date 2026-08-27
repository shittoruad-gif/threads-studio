/**
 * 日本語品質ガード（生成文の安全弁）。
 *
 * 2026-08-26、自動投稿の日本語が壊れていると三上さんから指摘があり、
 * その後「二度と起きないように」との指示で本格的なリサーチを実施した。
 *
 * リサーチ方法（2026-08-27）:
 *   Threads公開検索から同ジャンル（整体・ピラティス・美容室）の
 *   人間の投稿32本を収集し、自社の自動生成投稿40本と統計比較した。
 *
 * 数値で差が出た指標（人間 vs 生成）:
 *   「んです」系の頻度   0.12回/本 vs 0.82回/本（6.8倍）
 *   「実は」を含む投稿   0/32本    vs 7/40本
 *   「正直」を含む投稿   2/32本    vs 12/40本
 *   「ですよね」         0/32本    vs 8/40本
 *   「いませんか」       0/32本    vs 9/40本
 *   ✨/💦の装飾絵文字    4/32本    vs 13/40本
 *   「。」+絵文字        0/32本    vs 2/40本
 *
 * 質的な差:
 *   - 人間の問いかけは「本当に答えを知りたい質問」（おすすめありますか？等）。
 *     生成文の問いかけは「同意の確認」（〜いませんか？）で、人間はこれを書かない。
 *   - 人間は体言止め・「って」引用・「…」の余韻で文にリズムを作る。
 *   - 人間の絵文字は感情の山に置く（😭🥹）。装飾の✨はほぼ使わない。
 *
 * ガードの原則:
 *   リライトはベストエフォートで、失敗しても「リライト前の文」という
 *   安全な代替が常にある。だからこのガードは**書き直さない**。
 *   検査して不合格ならリライト前の文に戻すだけにする
 *   （機械で文章を直すと新しい不自然を作るため）。
 *   例外は polishPunctuation のみ（誤爆しない決定的な整形だけを行う）。
 */

/**
 * 絵文字にほぼ限定してマッチするパターン（日本語記号には当たらない）。
 * ビルドターゲットの都合で u フラグが使えないため、サロゲートペアで書く。
 */
const EMOJI_SRC =
  '(?:[\\u2600-\\u27BF\\u2728\\u2757\\u2049\\u203C]|\\uD83C[\\uDF00-\\uDFFF]|\\uD83D[\\uDC00-\\uDEFF]|\\uD83E[\\uDD00-\\uDFFF])\\uFE0F?';

/**
 * リライト後の文に出たら無条件で不合格にする決まり文句。
 *
 * 人間の投稿32本に1度も出なかった「同意を求める確認疑問」と、
 * 過去にプロンプトのお手本がコピーされた実例。
 * ここに増やすときは、人間コーパスでの出現がゼロであることを確認してから。
 */
export const BANNED_TIC_PHRASES: readonly string[] = [
  // プロンプトのお手本がそのままコピーされていた実例
  '同じ悩みの方、いませんか',
  '同じ方いませんか',
  // 同意を求める確認疑問（人間コーパス出現0。AIだけが書く）
  'いませんか？',
  'いませんか?',
  '思っていませんか',
  '思いませんか',
  '気になりませんか',
  // 口癖化していた実例（1回なら自然だが、機械には判定できないので禁止に倒す。
  // 本当に使いたい文はリライト前の文がそのまま生きる）
  '正直、',
];

/**
 * リライトが**勝手に足したら**不合格になる語（元の文にあれば通る）。
 *
 * 「実は」は不安をほどく型（reassurance）が正当に使うため無条件禁止にできない。
 * しかし人間の投稿では0/32本で、リライトが接ぎ木する常套句の筆頭だった。
 * 「元に無いのに増えた」ことだけを機械判定する。
 */
export const CRUTCH_WORDS: readonly string[] = ['実は', '正直', 'ぶっちゃけ', 'ちなみに'];

/** 「んです」系の語尾。人間0.12回/本に対し生成0.82回/本と、最大の癖だった */
const NDESU_RE = /(んです|なんです|んですよ|んですよね|んですけど)/g;

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
 * 人間コーパスの平均は61%で、ほぼ全てが55〜70%に収まる。
 * 「ひらがなが多すぎて不自然」と指摘された投稿は75%前後だった。
 * 境界の 0.72 を超えたら開きすぎと判定する。
 */
export const HIRAGANA_RATIO_MAX = 0.72;

/** 「んです」系の上限（1投稿あたり）。人間は最大でも1回だった */
export const NDESU_MAX = 2;

/** 末尾が問いかけ（？/?）で終わっているか */
export function endsWithQuestion(text: string): boolean {
  const tail = new RegExp('(?:[\\s。！!]|' + EMOJI_SRC + ')+$');
  const t = text.trim().replace(tail, '');
  return /[？?]$/.test(t);
}

/** 「んです」系の出現回数 */
export function countNdesu(text: string): number {
  return (text.match(NDESU_RE) ?? []).length;
}

/** 絵文字の個数 */
export function countEmoji(text: string): number {
  const re = new RegExp(EMOJI_SRC, 'g');
  return (text.match(re) ?? []).length;
}

/** 連続する2文の語尾（末尾3文字）が同じ箇所があるか */
export function hasRepeatedEnding(text: string): boolean {
  const ends = text
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
    .map((s) => s.slice(-3));
  for (let i = 1; i < ends.length; i++) {
    if (ends[i] === ends[i - 1]) return true;
  }
  return false;
}

/**
 * 決定的で誤爆しない整形だけを行う（唯一の「書き換え」）。
 *
 * 「。」の直後に絵文字が続く形（「〜しますね。✨」）は人間コーパスに1本も無く、
 * 機械が付ける句読点の癖。句点を落として絵文字を文末扱いにする。
 */
export function polishPunctuation(text: string): string {
  return text.replace(new RegExp('。(' + EMOJI_SRC + ')', 'g'), '$1');
}

/**
 * リライト後の文を検査する。
 *
 * 絶対条件（元の文と無関係に不合格）:
 *   決まり文句・ひらがな開きすぎ・「んです」系の過多
 * 相対条件（リライトで「悪化」したときだけ不合格）:
 *   口癖の接ぎ木・絵文字の増殖・装飾絵文字の追加・「！」の追加・
 *   語尾連続の発生・締めの書き換え
 *
 * @param naturalized リライト後の文
 * @param original    リライト前の文（悪化判定の基準）
 * @param opts.allowQuestionEnding 会話型（問いかけ締めが許可された投稿タイプ）か
 */
export function checkNaturalized(
  naturalized: string,
  original: string,
  opts: { allowQuestionEnding: boolean },
): QualityVerdict {
  // 1. 決まり文句・お手本コピー・同意確認疑問
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

  // 3. 「んです」系の使いすぎ（人間6.8倍の最大の癖）
  const ndesu = countNdesu(naturalized);
  if (ndesu > NDESU_MAX) {
    return { ok: false, reason: `「んです」系が${ndesu}回（上限${NDESU_MAX}回）` };
  }

  // 4. 口癖の接ぎ木：元に無い常套句をリライトが足した
  for (const w of CRUTCH_WORDS) {
    if (naturalized.includes(w) && !original.includes(w)) {
      return { ok: false, reason: `元に無い「${w}」を追加した` };
    }
  }

  // 5. 絵文字の増殖・装飾絵文字（✨💦）の追加
  if (countEmoji(naturalized) > Math.max(countEmoji(original), 2)) {
    return { ok: false, reason: '絵文字を増やした' };
  }
  for (const deco of ['✨', '💦']) {
    if (naturalized.includes(deco) && !original.includes(deco)) {
      return { ok: false, reason: `装飾絵文字${deco}を追加した` };
    }
  }

  // 6. 「！」の機械的な追加
  const bangs = (t: string) => (t.match(/[！!]/g) ?? []).length;
  if (bangs(naturalized) > bangs(original) + 1) {
    return { ok: false, reason: '「！」を増やした' };
  }

  // 7. 語尾連続の発生（元には無かったのにリライトで生まれた）
  if (hasRepeatedEnding(naturalized) && !hasRepeatedEnding(original)) {
    return { ok: false, reason: '同じ語尾が連続する形に書き換えた' };
  }

  // 8. 締めの形の書き換え：会話型でないのに、言い切りだった文を問いかけに変えた
  if (!opts.allowQuestionEnding && endsWithQuestion(naturalized) && !endsWithQuestion(original)) {
    return { ok: false, reason: '言い切りの締めを問いかけに書き換えた（会話型以外は禁止）' };
  }

  return { ok: true };
}

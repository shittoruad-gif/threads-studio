/**
 * 文体のお手本（projects.styleSamples）から、機械で数えられる癖だけを取り出す（2026-09-11）。
 *
 * なぜ必要か（9/11未明の実測）:
 *   岩根様（㈱津の国や本店・口調「丁寧な敬語＋少しフレンドリー」）の投稿が、3枠すべて・3回ずつ
 *   `naturalnessReview` で 2/5 に落ち、その日の投稿がゼロになった。落ちた理由はどの回も同じで
 *   「お手本にある店主の個人的な体験や感情、絵文字を用いた少しフレンドリーな口調が欠けている」。
 *
 *   原因はガードではなく、こちらの指示が正面から矛盾していたこと:
 *     - 生成の最終指示（AUTO_POST_STYLE_ADDENDUM）は「絵文字を1〜3個、毎回必ず入れる」
 *     - 口語リライト（naturalizeContent）は、口調に「敬語・丁寧」が入っていると
 *       「絵文字は使わない（元の文にあっても消す）」
 *     - そのあとの AI採点は、絵文字たっぷりのお手本と比べて「絵文字が無い」と落とす
 *   「丁寧な敬語＋少しフレンドリー」は契約中7名のうち4名が登録している一番多い口調で、
 *   全員がこの矛盾を踏んでいた。
 *
 * お手本の文言を渡して「読み取って」と頼むだけでは、この癖は毎回同じには再現されない。
 * 絵文字の個数・ハッシュタグ・一人称の体験談は数えられるので、事実として指示に書く。
 * ここでは判断をしない（何個使うべきかは決めない）。数えた結果だけを返す。
 */
import { countEmoji } from './jpQualityGuard';
import { isFriendlyVoice } from './voiceGuard';

export interface StyleTraits {
  /** お手本の本数 */
  sampleCount: number;
  /** お手本1本あたりの絵文字の個数（四捨五入しない実数） */
  emojiPerPost: number;
  /** お手本が絵文字を使っているか（1本あたり0.5個以上） */
  usesEmoji: boolean;
  /** ハッシュタグを使っているお手本の割合が半分以上か */
  usesHashtags: boolean;
  /** 一人称で自分の体験・気持ちを書いているお手本が半分以上か */
  writesOwnExperience: boolean;
  /** お手本1本の平均文字数 */
  avgLength: number;
}

/** 一人称（この人自身が主語になっている印） */
const FIRST_PERSON_RE = /(私|わたし|僕|ぼく|自分|うち)/;
/** 自分の体験・気持ちの印（日付の言葉・感情の言葉） */
const EXPERIENCE_RE = /(今日|昨日|今朝|先日|この前|さっき|嬉し|楽し|幸せ|ありがた|感謝|好き|大好き|思いました|感じました|行って(?:き|参り)ました)/;

/** お手本を1本ずつに分ける（保存時の区切りは "\n---\n"） */
export function splitStyleSamples(styleSamples: string | null | undefined): string[] {
  return String(styleSamples || '')
    .split(/\n-{3,}\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * お手本の癖を数える。お手本が無ければ null（＝これまでどおりの生成にする）。
 */
export function extractStyleTraits(styleSamples: string | null | undefined): StyleTraits | null {
  const samples = splitStyleSamples(styleSamples);
  if (samples.length === 0) return null;

  let emoji = 0;
  let hashtag = 0;
  let experience = 0;
  let chars = 0;
  for (const s of samples) {
    emoji += countEmoji(s);
    if (/(^|\s)#\S/m.test(s)) hashtag += 1;
    if (FIRST_PERSON_RE.test(s) && EXPERIENCE_RE.test(s)) experience += 1;
    chars += Array.from(s).length;
  }
  const n = samples.length;
  return {
    sampleCount: n,
    emojiPerPost: emoji / n,
    usesEmoji: emoji / n >= 0.5,
    usesHashtags: hashtag * 2 >= n,
    writesOwnExperience: experience * 2 >= n,
    avgLength: Math.round(chars / n),
  };
}

/**
 * この方の投稿に絵文字を入れてよいか。
 * お手本が絵文字を使っている／口調にフレンドリーが入っている、のどちらかなら使ってよい。
 * どちらも無いときだけ「使わない」（比嘉先生の「敬語で落ち着いた口調」がこちら）。
 */
export function emojiAllowed(
  brandVoice: string | null | undefined,
  styleSamples: string | null | undefined,
): boolean {
  if (isFriendlyVoice(brandVoice)) return true;
  const t = extractStyleTraits(styleSamples);
  return !!t?.usesEmoji;
}

/**
 * 数えた癖を、生成プロンプトに足す文にする。
 * 「お手本を読み取って」ではなく、数えた事実を条件として書く。
 */
export function styleTraitsNote(traits: StyleTraits | null): string {
  if (!traits) return '';
  const lines: string[] = [];
  if (traits.usesEmoji) {
    const n = Math.min(3, Math.max(1, Math.round(traits.emojiPerPost)));
    lines.push(`- お手本は絵文字を使っています（1本あたり約${traits.emojiPerPost.toFixed(1)}個）。この投稿にも絵文字を${n}個、気持ちが動くところに入れる（1行目には入れない）。`);
  } else {
    lines.push('- お手本は絵文字をほとんど使っていません。この投稿にも絵文字を入れない。');
  }
  if (traits.writesOwnExperience) {
    lines.push('- お手本には店主自身の体験や気持ちが書かれています。この投稿にも「自分がどう思ったか・何をしたか」の1文を必ず入れる（説明だけで終わらせない）。');
  }
  if (traits.usesHashtags) {
    lines.push('- お手本はハッシュタグを付けています。本文の最後に、この投稿の内容に合うハッシュタグを2〜4個だけ改行して並べる（1行目には入れない）。');
  }
  return `\n\n【お手本から数えた癖（推測ではなく実測。厳守）】\n${lines.join('\n')}`;
}

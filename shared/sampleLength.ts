/**
 * お客様ごとの長さ（文体のお手本の平均文字数に合わせる）
 *
 * 2026-10-03 三上様「短めではなく、相手の平均的な文字数に合わせて作って」。
 * これまでは全員に「50〜100字」を一律で指示していたため、お手本が140字前後の方
 * （香取様：お手本7本の平均141字）にも90字前後の投稿が届き、「本人の文と違う」
 * 「日本語が不自然」の一因になっていた（短く削るために説明が飛ぶ）。
 *
 * 決まり：
 *  - お手本が3本以上あるときだけ使う（少ないと平均がぶれる）。
 *  - 範囲は 平均×0.88〜平均×1.13。下限50字・上限300字で止める（Threadsの読みやすさと500字制限の余白）。
 *  - 「長め」を本人が選んでいる方、反応改善の試験中の方（shared/reactionBoost.ts）には使わない。
 */
import { splitStyleSamples } from './styleTraits';

export interface LengthRange {
  avg: number;
  lo: number;
  hi: number;
  /** お手本の本数 */
  n: number;
}

const MIN_SAMPLES = 3;
const FLOOR = 50;
const CEIL = 300;
/** 1本が極端に長いもの（固定投稿・記事の貼り付け等）は平均から外す */
const OUTLIER = 500;

/** 投稿の文字数（改行・空白は数えない。読んだときの長さに近づける） */
export function visibleLength(s: string): number {
  return Array.from(String(s || '').replace(/\s+/g, '')).length;
}

export function sampleLengthRange(styleSamples: string | null | undefined): LengthRange | null {
  const lens = splitStyleSamples(styleSamples)
    .map(visibleLength)
    .filter((n) => n >= 20 && n <= OUTLIER);
  if (lens.length < MIN_SAMPLES) return null;
  const avg = Math.round(lens.reduce((a, b) => a + b, 0) / lens.length);
  const clamp = (n: number) => Math.min(CEIL, Math.max(FLOOR, n));
  const lo = clamp(Math.round(avg * 0.88));
  const hi = clamp(Math.max(lo + 10, Math.round(avg * 1.13)));
  return { avg, lo, hi, n: lens.length };
}

/** 機械カットの上限（本文＋案内）。指示の上限より少し余白を取る。既定より小さくはしない */
export function budgetForRange(range: LengthRange | null, fallback: number): number {
  if (!range) return fallback;
  return Math.max(fallback, Math.min(480, range.hi + 60));
}

/**
 * プロンプト内の「50〜100字」系の一律ルールを、この方の範囲に置き換える。
 * 文言は shared/threadsPrompts.ts・server/autoPostScheduler.ts・shared/postLength.ts の現行文に合わせている
 * （文言を変えたら sampleLength.test.ts が落ちるようにしてある）。
 */
export function applyLengthRange(prompt: string, range: LengthRange | null): string {
  if (!range) return prompt;
  const r = `${range.lo}〜${range.hi}`;
  return prompt
    // 実測の一般論の行は、この方には当てはまらないので丸ごと差し替える
    .replace(/^.*実測データ（114アカウント・3\.2万投稿の分析）.*$/m,
      `★この方の文体のお手本は平均${range.avg}字。お手本と同じくらいの長さで書く（短く削りすぎて説明が飛ぶと、本人の文に見えない）。`)
    .replace(/^.*実測（114アカウント・3\.2万投稿）では50字までが最も見られ.*$/gm,
      `- この方のお手本は平均${range.avg}字。お手本と同じくらいの長さで書く。水増しはしない。`)
    .replace(/^\s*実測（3\.2万投稿）では50字までが最も見られ.*$/gm,
      `  この方のお手本は平均${range.avg}字。お手本と同じくらいの長さで書く。`)
    .replace(/理想は50字前後で言い切る。/g, `お手本と同じくらい（${range.avg}字前後）で言い切る。`)
    .replace(/50〜100(文字|字)/g, `${r}$1`)
    .replace(/CTAを?含めても合計\s*200文字/g, `CTAを含めても合計${range.hi + 80}文字`);
}

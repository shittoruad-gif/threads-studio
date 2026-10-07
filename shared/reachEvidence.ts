/**
 * 承認カードに「この切り口は、ふだんより見られています」を一言添える（2026-10-07 三上様
 * 「毎回見送るクライアントに関しては…違う内容でも閲覧数が取れて結果が残せるのであれば問題ない」）。
 *
 * ご本人のイメージと違う内容でも、実際に見られている切り口なら出していただきたい。
 * 判断の材料として、そのお客様の公開済みの投稿の実数だけを添える（推測・他店の数字は書かない）。
 * 本数が少ない・差が小さいときは何も書かない。
 */
export const REACH_NOTE = {
  /** この本数以上の公開実績がある切り口だけ */
  minCount: 3,
  /** ふだんの平均のこの倍以上見られている切り口だけ */
  minRatio: 1.2,
} as const;

export interface AnglePerf {
  perAngle: Record<string, { avgImpressions: number; count: number }>;
  overallAvg: number;
}

export function reachNoteFor(angle: string | null | undefined, perf: AnglePerf | null | undefined): string | null {
  if (!angle || !perf || !(perf.overallAvg > 0)) return null;
  if (angle === "meta_ai_call" || angle === "pinned") return null;
  const a = perf.perAngle[angle];
  if (!a || a.count < REACH_NOTE.minCount) return null;
  const ratio = a.avgImpressions / perf.overallAvg;
  if (ratio < REACH_NOTE.minRatio) return null;
  return `この形の投稿は、これまで${a.count}本の平均で、ふだんの約${ratio.toFixed(1)}倍見られています。`;
}

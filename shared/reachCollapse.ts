/**
 * 表示回数（インプレッション）の急な落ち込みの判定（2026-11-11）。
 *
 * 毎朝の健全性点検（server/accountHealthJob.ts）は「制限のエラー」と「投稿が消えた」しか見ておらず、
 * 投稿は公開できているのに誰にも表示されなくなった状態（表示が前の2割を切る）に気づけなかった。
 * 実例：1投稿あたり60〜80回だったアカウントが、ある週から3〜4回になり、2週間そのまま1日3件を出し続けていた。
 *
 * 判定は中央値で行う（1本だけ大きく伸びた投稿に引っ張られないように）。
 *  - 直近：公開から2日以上たった、9日前までの投稿（数字が出そろってから見る）
 *  - 以前：その前の4週間
 *  - 直近が5件以上・以前が10件以上・以前の中央値が10回以上あるときだけ判定する
 *  - 直近の中央値が、以前の中央値の2割を下回ったら「急な落ち込み」
 */
export const REACH_RECENT_FROM_DAYS = 9;
export const REACH_RECENT_TO_DAYS = 2;
export const REACH_PRIOR_FROM_DAYS = 37;
export const REACH_MIN_RECENT = 5;
export const REACH_MIN_PRIOR = 10;
export const REACH_MIN_PRIOR_MEDIAN = 10;
export const REACH_COLLAPSE_RATIO = 0.2;

export function median(values: number[]): number {
  const v = values.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export type ReachJudgement = {
  collapsed: boolean;
  recentCount: number;
  priorCount: number;
  recentMedian: number;
  priorMedian: number;
  /** 直近 ÷ 以前（以前が0のときは null） */
  ratio: number | null;
};

export function judgeReachCollapse(recent: number[], prior: number[]): ReachJudgement {
  const recentMedian = median(recent);
  const priorMedian = median(prior);
  const ratio = priorMedian > 0 ? recentMedian / priorMedian : null;
  const enough = recent.length >= REACH_MIN_RECENT && prior.length >= REACH_MIN_PRIOR && priorMedian >= REACH_MIN_PRIOR_MEDIAN;
  return {
    collapsed: enough && ratio !== null && ratio < REACH_COLLAPSE_RATIO,
    recentCount: recent.length,
    priorCount: prior.length,
    recentMedian,
    priorMedian,
    ratio,
  };
}

/** 運営への知らせの本文（お客様の名前は入れず、アカウント名と数字だけ） */
export function reachCollapseOwnerText(a: { username: string; userId: number; cooledUntil: string | null }, j: ReachJudgement): string {
  const pct = j.ratio === null ? "-" : `${Math.round(j.ratio * 100)}%`;
  return [
    `@${a.username}（user ${a.userId}）`,
    `1投稿あたりの表示（中央値）：以前4週間 ${Math.round(j.priorMedian)}回（${j.priorCount}件）→ 直近1週間 ${Math.round(j.recentMedian)}回（${j.recentCount}件）＝${pct}`,
    a.cooledUntil ? `${a.cooledUntil} まで1日1件に絞りました。お客様へはまだお知らせしていません。` : `すでに1日1件に絞っている期間中です。`,
    `Threads側で表示を抑えられている可能性があります。投稿の中身（同じ言い回し・宣伝の強さ）とプロフィールを見直してください。`,
  ].join("\n");
}

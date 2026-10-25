/**
 * 全アカウントの実測から「どの切り口がよく見られているか」を出す（2026-10-25 三上様「伸びる投稿を横展開させて、
 * すべてのアカウントでリーチが伸びるように」）。
 *
 *   それぞれのアカウントの「普段」（表示回数の真ん中の値）に対して、その切り口の投稿が何倍見られたかを出し、
 *   その倍率の真ん中の値を切り口ごとにまとめる。店の大きさ（フォロワーの多い少ない）の差を消すため、絶対値では比べない。
 *   自分のアカウントでまだ数が少ない切り口は、この全体の倍率で選ばれやすさを決め、数がたまるほど自分の実測に寄せる。
 *
 *   10/15〜10/24 の実測（お客様22アカウント・708本）：地元の会話 1.89倍（返信が付いた率21%）、あるある・数字 1.17倍、
 *   地元ネタ 1.12倍 … 悩み深掘り 0.61倍、安心させる 0.56倍、お客様の声 0.53倍。
 */
export interface PooledViewRatio { ratio: number; n: number; accounts: number }
export type PooledViews = Record<string, PooledViewRatio>;

export const POOLED_VIEWS = {
  /** これより少ない切り口は使わない（偶然のブレ） */
  minPosts: 15,
  minAccounts: 4,
  /** 倍率の上限・下限（極端に寄せない） */
  min: 0.6,
  max: 1.6,
} as const;

const median = (a: number[]): number => {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)]!;
};

export function computePooledViews(rows: { accountId: number; angle: string | null; impressions: number }[]): PooledViews {
  const byAcc = new Map<number, number[]>();
  for (const r of rows) byAcc.set(r.accountId, [...(byAcc.get(r.accountId) ?? []), Number(r.impressions) || 0]);
  const accMed = new Map<number, number>();
  byAcc.forEach((vs, acc) => accMed.set(acc, Math.max(1, median(vs))));
  const byAngle = new Map<string, { ratios: number[]; accs: Set<number> }>();
  for (const r of rows) {
    if (!r.angle) continue;
    const g = byAngle.get(r.angle) ?? { ratios: [], accs: new Set<number>() };
    g.ratios.push((Number(r.impressions) || 0) / accMed.get(r.accountId)!);
    g.accs.add(r.accountId);
    byAngle.set(r.angle, g);
  }
  const out: PooledViews = {};
  Array.from(byAngle.entries()).forEach(([angle, g]) => {
    if (g.ratios.length < POOLED_VIEWS.minPosts || g.accs.size < POOLED_VIEWS.minAccounts) return;
    out[angle] = { ratio: Math.min(POOLED_VIEWS.max, Math.max(POOLED_VIEWS.min, median(g.ratios))), n: g.ratios.length, accounts: g.accs.size };
  });
  return out;
}

/**
 * 自分の実測（ownRaw・母数 count）と全体の倍率をまぜる。
 *   自分の数が0〜2本：全体の倍率だけ／3本〜：自分の実測の比重が増え、8本で自分の実測だけ。
 */
export function blendWithPooled(ownRaw: number | null, count: number, pooled: PooledViewRatio | undefined): number {
  const own = ownRaw == null || count < 3 ? null : ownRaw;
  const c = own == null ? 0 : Math.min(1, (count - 2) / 6);
  const prior = pooled ? pooled.ratio : 1;
  return own == null ? prior : c * own + (1 - c) * prior;
}

import { describe, it, expect } from "vitest";
import { computePooledViews, blendWithPooled, POOLED_VIEWS } from "../shared/pooledViews";
import { pickAngle } from "../shared/postAngles";

function rows() {
  const out: { accountId: number; angle: string; impressions: number }[] = [];
  // 5アカウント：大きい店（普段1000）と小さい店（普段50）。local_talk は普段の2倍、deep_worry は普段の半分
  for (const [acc, base] of [[1, 1000], [2, 50], [3, 200], [4, 80], [5, 400]] as const) {
    for (let i = 0; i < 6; i++) out.push({ accountId: acc, angle: "number_result", impressions: base });
    for (let i = 0; i < 4; i++) out.push({ accountId: acc, angle: "local_talk", impressions: base * 2 });
    for (let i = 0; i < 4; i++) out.push({ accountId: acc, angle: "deep_worry", impressions: base / 2 });
    out.push({ accountId: acc, angle: "rare", impressions: base * 3 });
  }
  return out;
}

describe("全アカウントの実測で切り口の倍率を出す（横展開）", () => {
  it("店の大きさに関係なく、普段の何倍かで比べる", () => {
    const p = computePooledViews(rows());
    expect(p.local_talk!.ratio).toBe(POOLED_VIEWS.max === 1.6 ? 1.6 : 2);
    expect(p.deep_worry!.ratio).toBe(0.6);
    expect(p.number_result!.ratio).toBe(1);
  });
  it("数が少ない切り口は使わない", () => {
    expect(computePooledViews(rows()).rare).toBeUndefined();
  });
  it("自分の数が少ないうちは全体の倍率、たまるほど自分の実測", () => {
    expect(blendWithPooled(null, 0, { ratio: 1.5, n: 30, accounts: 5 })).toBe(1.5);
    expect(blendWithPooled(0.5, 8, { ratio: 1.5, n: 30, accounts: 5 })).toBe(0.5);
    expect(blendWithPooled(0.5, 5, { ratio: 1.5, n: 30, accounts: 5 })).toBeCloseTo(1.0, 5);
  });
  it("選ばれやすさに効く：他店で伸びている切り口がよく選ばれ、伸びていない切り口は減る", () => {
    const perf: any = { perAngle: {}, overallAvg: 100, pooledViews: { number_result: { ratio: 1.6, n: 30, accounts: 5 }, deep_worry: { ratio: 0.6, n: 30, accounts: 5 } } };
    let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const cnt: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) { const a = pickAngle({}, rnd, perf, Date.parse("2026-11-01T00:00:00+09:00"), "store", { excludeLocalTalk: true }); cnt[a.id] = (cnt[a.id] ?? 0) + 1; }
    expect(cnt.number_result).toBeGreaterThan((cnt.deep_worry ?? 0) * 2);
  });
});

import { describe, it, expect } from "vitest";
import {POST_ANGLES, pickAngle, type AnglePerformance, ANGLE_FOCUS, activeAngles, getAngle} from "../shared/postAngles";

/** 指定の乱数列を順に返す（重み付き抽選の検証用） */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

/** 大量に引いて、切り口ごとの出現回数を数える */
function sample(stats: any, perf: AnglePerformance | undefined, n = 4000): Record<string, number> {
  let s = 0;
  const rand = () => {
    // 0〜1を均等に走査する疑似乱数（Math.randomに依存しない再現可能な分布）
    s = (s + 1 / n) % 1;
    return s;
  };
  const counts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    // 既存テストは全切り口プールの挙動を検証する（集中検証期間の影響を受けないよう期間外の時刻を渡す）
    const a = pickAngle(stats, rand, perf, Date.parse('2026-09-12T12:00:00+09:00'));
    counts[a.id] = (counts[a.id] ?? 0) + 1;
  }
  return counts;
}

describe("切り口の重み付け", () => {
  it("評価も実績も無いときは全切り口がほぼ均等に出る", () => {
    const counts = sample({}, undefined);
    const values = POST_ANGLES.map((a) => counts[a.id] ?? 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    expect(min).toBeGreaterThan(0);
    expect(max - min).toBeLessThanOrEqual(2);
  });

  it("◯が付いた切り口は出やすく、✕が付いた切り口は出にくい", () => {
    const target = POST_ANGLES[0].id;
    const disliked = POST_ANGLES[1].id;
    const counts = sample({ [target]: { good: 3, bad: 0 }, [disliked]: { good: 0, bad: 2 } }, undefined);
    expect(counts[target]).toBeGreaterThan(counts[disliked]);
  });

  it("実績が全体平均より高い切り口は出やすくなる", () => {
    const winner = POST_ANGLES[0].id;
    const loser = POST_ANGLES[1].id;
    const perf: AnglePerformance = {
      overallAvg: 100,
      perAngle: {
        [winner]: { avgImpressions: 180, count: 10 },
        [loser]: { avgImpressions: 40, count: 10 },
      },
    };
    const counts = sample({}, perf);
    expect(counts[winner]).toBeGreaterThan(counts[loser]);
    // 未評価の切り口も消えない（新しい型を試す余地を残す）
    expect(counts[POST_ANGLES[2].id]).toBeGreaterThan(0);
  });

  it("母数が2件以下の実績では重みを動かさない（偶然のブレで決めつけない）", () => {
    const a = POST_ANGLES[0].id;
    const perf: AnglePerformance = {
      overallAvg: 100,
      perAngle: { [a]: { avgImpressions: 5000, count: 2 } },
    };
    const withPerf = sample({}, perf);
    const without = sample({}, undefined);
    expect(withPerf[a]).toBe(without[a]);
  });

  it("実績データが空でも例外なく1つ返す", () => {
    const angle = pickAngle({}, seq([0.5]), { perAngle: {}, overallAvg: 0 }, Date.parse('2026-09-12T12:00:00+09:00'));
    expect(POST_ANGLES.some((a) => a.id === angle.id)).toBe(true);
  });
});

describe("切り口の集中検証期間（2026-08-29〜09-11）", () => {
  const during = Date.parse("2026-09-05T12:00:00+09:00");
  const after = Date.parse("2026-09-12T00:00:01+09:00");

  it("フォーカスの8切り口はすべて実在する", () => {
    for (const id of ANGLE_FOCUS.ids) {
      expect(getAngle(id), `${id} が存在しない`).toBeTruthy();
    }
    expect(ANGLE_FOCUS.ids.length).toBe(8);
  });

  it("期間中は8切り口だけが選ばれる", () => {
    expect(activeAngles(during).map((a) => a.id).sort()).toEqual([...ANGLE_FOCUS.ids].sort());
    for (let i = 0; i < 200; i++) {
      const a = pickAngle({}, Math.random, undefined, during);
      expect(ANGLE_FOCUS.ids).toContain(a.id);
    }
  });

  it("期限を過ぎると全切り口に自動復帰する", () => {
    expect(activeAngles(after).length).toBe(POST_ANGLES.length);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(pickAngle({}, Math.random, undefined, after).id);
    expect(seen.size).toBeGreaterThan(ANGLE_FOCUS.ids.length);
  });
});

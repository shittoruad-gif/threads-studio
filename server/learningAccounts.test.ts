import { describe, it, expect } from "vitest";
import { inLearning, learningExtra, trialFor, learningSlotTimes, LEARNING_TRIALS, LEARNING_ACCOUNTS } from "../shared/learningAccounts";
import { groupByRatio, lengthBucket, firstLineTraits, learningReportText, type LearningRow } from "../shared/learningReport";
import { postingTimeTestHours } from "../shared/postingTimeTest";

// 2026-10-07 三上様「Moveactの店舗をもっと投稿数を増やして、リーチが取れる投稿の傾向を取れるように」
const at = (ymd: string, hm = "06:00") => Date.parse(`${ymd}T${hm}:00+09:00`);
const fmt = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(11, 16);

describe("学習用アカウント", () => {
  it("自社の Moveact 2店だけ・期間内だけ", () => {
    expect(inLearning(10, at("2026-10-08"))).toBe(true);
    expect(inLearning(12, at("2026-11-30"))).toBe(true);
    expect(inLearning(10, at("2026-10-07"))).toBe(false);
    expect(inLearning(10, at("2026-12-01"))).toBe(false);
    for (const customer of [11, 21, 22, 24, 36]) expect(inLearning(customer, at("2026-10-10"))).toBe(false);
  });
  it("冷却・慣らしで抑えている日は上乗せしない", () => {
    expect(learningExtra(10, { capped: false }, at("2026-10-10"))).toBe(2);
    expect(learningExtra(10, { capped: true }, at("2026-10-10"))).toBe(0);
  });
  it("試しは9種類を順に回し、同じ日の2店・2枠で同じ条件にならない", () => {
    const seen: Record<string, number> = {};
    for (let d = 0; d < 36; d++) {
      const now = at("2026-10-08") + d * 86400e3;
      const today = [trialFor(10, 0, now), trialFor(10, 1, now), trialFor(12, 0, now), trialFor(12, 1, now)].map((t) => t.key);
      expect(new Set(today).size).toBe(4);
      for (const k of today) seen[k] = (seen[k] ?? 0) + 1;
    }
    expect(Object.keys(seen).length).toBe(LEARNING_TRIALS.length);
    // 36日×4枠＝144本 → 9種類に16本ずつ
    for (const k of Object.keys(seen)) expect(seen[k]).toBe(16);
  });
  it("学習の枠の時刻：投稿時間の試験の5枠のあいだに、ほかの枠と1時間以上あけて2本置ける（試験の全日程）", () => {
    for (let d = 0; d < 34; d++) for (const a of LEARNING_ACCOUNTS.accountIds) {
      const now = new Date(at("2026-09-24") + d * 86400e3);
      const hours = postingTimeTestHours(a, now)!;
      const times = learningSlotTimes(hours, 2, "2026-10-10");
      expect(times.length).toBe(2);
      const mins = times.map((t) => { const [h, m] = fmt(t).split(":").map(Number); return h * 60 + m; });
      for (const m of mins) {
        expect(m).toBeGreaterThanOrEqual(7 * 60);
        expect(m).toBeLessThanOrEqual(23 * 60);
        // ほかの枠は h:00〜h:29 に出る
        for (const h of hours) expect(Math.min(Math.abs(m - h * 60), Math.abs(m - (h * 60 + 29)))).toBeGreaterThanOrEqual(60);
      }
      expect(Math.abs(mins[0] - mins[1])).toBeGreaterThanOrEqual(60);
    }
  });
  it("1時間以上あけられなければ置かない", () => {
    const packed = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
    expect(learningSlotTimes(packed, 2, "2026-10-10").length).toBe(0);
  });
});

describe("リーチの傾向の集計", () => {
  const now = at("2026-10-30", "12:00");
  const old = new Date(at("2026-10-20"));
  const row = (accountId: number, impressions: number, text: string, experimentKey: string | null = null): LearningRow =>
    ({ accountId, impressions, postedAt: old, text, experimentKey, angle: "local", area: "岡山県倉敷市玉島" });
  it("アカウントごとの中央値でそろえる（大きい店に引っ張られない）", () => {
    const rows = [
      ...[100, 100, 100, 100].map((v) => row(1, v, "ふつう")),
      ...[1000, 1000, 1000, 1000].map((v) => row(2, v, "ふつう")),
      ...[200, 200, 200].map((v) => row(1, v, "短", "len_oneliner")),
      ...[2000, 2000, 2000].map((v) => row(2, v, "短", "len_oneliner")),
    ];
    const g = groupByRatio(rows, (r) => r.experimentKey ?? "control", undefined, now);
    const one = g.find((x) => x.key === "len_oneliner")!;
    expect(one.n).toBe(6);
    expect(one.medianRatio).toBeGreaterThanOrEqual(1.3);
    expect(one.verdict).toBe("伸びる");
  });
  it("本数が足りなければ「まだ分からない」", () => {
    const rows = [...[100, 100, 100].map((v) => row(1, v, "a")), row(1, 900, "b", "len_long")];
    expect(groupByRatio(rows, (r) => r.experimentKey ?? "control", undefined, now).find((x) => x.key === "len_long")!.verdict).toBe("まだ分からない");
  });
  it("公開から48時間たっていない投稿は数えない", () => {
    const fresh = { ...row(1, 9999, "a", "len_long"), postedAt: new Date(now - 3600e3) };
    expect(groupByRatio([fresh], (r) => r.experimentKey, undefined, now)).toEqual([]);
  });
  it("長さ・1行目の見分け", () => {
    expect(lengthBucket("あ".repeat(40))).toBe("〜50字");
    expect(lengthBucket("あ".repeat(300))).toBe("251字〜");
    expect(firstLineTraits("肩こり、放っていませんか？\n本文")).toContain("1行目が問いかけ");
    expect(firstLineTraits("3つのコツ\n本文")).toContain("1行目に数字");
    expect(firstLineTraits("倉敷市で整体なら\n本文", "岡山県倉敷市玉島")).toContain("1行目に地域名");
    expect(firstLineTraits("こんにちは\n本文")).toEqual(["1行目にどれも無し"]);
  });
  it("まとめの文に、基準と承諾が要ることが書いてある", () => {
    const t = learningReportText({ learning: [], all: [], days: 21, now });
    expect(t).toContain("6本以上");
    expect(t).toContain("三上様の承諾後");
  });
});

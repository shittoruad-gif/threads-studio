import { describe, expect, it } from "vitest";
import { POSTING_TIME_TEST, postingTimeTestHours } from "../shared/postingTimeTest";

const jst = (ymdhm: string) => new Date(`${ymdhm}:00+09:00`);

describe("投稿時間の試験", () => {
  it("対象外のアカウントは null（今までどおり）", () => {
    expect(postingTimeTestHours(99, jst("2026-09-26T06:00"))).toBeNull();
  });

  it("期間の前後は null", () => {
    expect(postingTimeTestHours(10, jst("2026-09-23T23:59"))).toBeNull();
    expect(postingTimeTestHours(10, jst("2026-10-12T06:00"))).toBeNull();
    expect(postingTimeTestHours(10, jst("2026-09-24T06:00"))).not.toBeNull();
    expect(postingTimeTestHours(10, jst("2026-10-11T06:00"))).not.toBeNull();
  });

  it("6日で各時間が3回ずつ（1日3件の場合）", () => {
    for (const acc of POSTING_TIME_TEST.accountIds) {
      const count = new Map<number, number>();
      for (let d = 0; d < 6; d++) {
        const day = new Date(jst("2026-09-24T06:00").getTime() + d * 86_400_000);
        for (const h of postingTimeTestHours(acc, day)!.slice(0, 3)) count.set(h, (count.get(h) ?? 0) + 1);
      }
      for (const h of POSTING_TIME_TEST.hours) expect(count.get(h)).toBe(3);
    }
  });

  it("1日の時間は重ならず、ランダムの分を足しても25分以上あく", () => {
    for (let d = 0; d < 18; d++) {
      const day = new Date(jst("2026-09-24T06:00").getTime() + d * 86_400_000);
      const hs = postingTimeTestHours(10, day)!;
      expect(new Set(hs).size).toBe(6);
      const sorted = [...hs].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) expect((sorted[i] - sorted[i - 1]) * 60 - 29).toBeGreaterThanOrEqual(25);
    }
  });

  it("朝は9時より前に出さない（毎朝の点検が先に見られるように）", () => {
    expect(Math.min(...POSTING_TIME_TEST.hours)).toBeGreaterThanOrEqual(9);
  });

  it("同じ日に全アカウントが同じ時間にならない", () => {
    const day = jst("2026-09-27T06:00");
    const sets = POSTING_TIME_TEST.accountIds.map((a) => postingTimeTestHours(a, day)!.slice(0, 3).join(","));
    expect(new Set(sets).size).toBe(sets.length);
  });
});

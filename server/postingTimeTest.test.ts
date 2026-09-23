import { describe, expect, it } from "vitest";
import { POSTING_TIME_TEST, postingTimeTestHours } from "../shared/postingTimeTest";

const jst = (ymdhm: string) => new Date(`${ymdhm}:00+09:00`);
const dayN = (d: number) => new Date(jst("2026-09-24T06:00").getTime() + d * 86_400_000);

describe("投稿時間の試験（7〜23時の1時間ごと）", () => {
  it("対象外のアカウントは null（今までどおり）", () => {
    expect(postingTimeTestHours(99, jst("2026-09-26T06:00"))).toBeNull();
  });

  it("期間の前後は null", () => {
    expect(postingTimeTestHours(10, jst("2026-09-23T23:59"))).toBeNull();
    expect(postingTimeTestHours(10, jst("2026-10-28T06:00"))).toBeNull();
    expect(postingTimeTestHours(10, jst("2026-09-24T06:00"))).not.toBeNull();
    expect(postingTimeTestHours(10, jst("2026-10-27T06:00"))).not.toBeNull();
  });

  it("候補は7時〜23時の17通り", () => {
    expect([...POSTING_TIME_TEST.hours]).toEqual(Array.from({ length: 17 }, (_, i) => 7 + i));
  });

  it("17日で各時間が3回ずつ（1日3件の場合）", () => {
    for (const acc of POSTING_TIME_TEST.accountIds) {
      const count = new Map<number, number>();
      for (let d = 0; d < 17; d++) for (const h of postingTimeTestHours(acc, dayN(d))!.slice(0, 3)) count.set(h, (count.get(h) ?? 0) + 1);
      for (const h of POSTING_TIME_TEST.hours) expect(count.get(h)).toBe(3);
    }
  });

  it("1日の枠は重ならず、ランダムの分を足しても25分以上あく（4件目を含む）", () => {
    for (const acc of POSTING_TIME_TEST.accountIds) {
      for (let d = 0; d < 34; d++) {
        const hs = postingTimeTestHours(acc, dayN(d))!;
        expect(new Set(hs).size).toBe(4);
        const sorted = [...hs].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) expect((sorted[i] - sorted[i - 1]) * 60 - 29).toBeGreaterThanOrEqual(25);
      }
    }
  });

  it("同じ日の4アカウント×3枠はすべて別の時間", () => {
    for (let d = 0; d < 17; d++) {
      const all = POSTING_TIME_TEST.accountIds.flatMap((a) => postingTimeTestHours(a, dayN(d))!.slice(0, 3));
      expect(new Set(all).size).toBe(12);
    }
  });
});

import { describe, it, expect } from "vitest";
import { personalNoticesFor, personalNoticeUserIds, PERSONAL_NOTICES } from "../shared/personalNotices";

describe("個別のお知らせ（朝のまとめの直後のもう1通）", () => {
  const jst = (s: string) => Date.parse(s + "+09:00");
  it("送る日にだけ、その方の分を返す", () => {
    expect(personalNoticeUserIds(jst("2026-09-11T07:40:00")).sort((a, b) => a - b)).toEqual([556, 2768, 2907, 3500, 5002, 5443]);
    expect(personalNoticesFor(3500, jst("2026-09-11T07:40:00"))[0]?.requireAccountPostsToday).toEqual({ accountId: 21, min: 2 });
    expect(personalNoticeUserIds(jst("2026-09-12T07:40:00"))).toEqual([]);
  });
  it("文面は宛名で始まり、戻し方や補填の日付を含む・内部用語なし", () => {
    for (const n of PERSONAL_NOTICES) {
      expect(n.text.startsWith(n.text.split("\n")[0])).toBe(true);
      expect(n.text).toContain("様");
      expect(n.text).toContain("申し訳ございません");
      for (const ng of ["identityGuard", "naturalness", "API", "userId"]) expect(n.text).not.toContain(ng);
      expect(Array.from(n.text).length).toBeLessThan(1000);
    }
  });
});

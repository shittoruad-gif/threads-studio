import { describe, it, expect } from "vitest";
import { announcementForToday, DAILY_ANNOUNCEMENTS } from "../shared/announcements";

/** 8:30の案内と一緒に、その日だけ全員へ送るお知らせ（2026-09-09） */
describe("その日のお知らせ", () => {
  const jst = (s: string) => Date.parse(s + "+09:00");

  it("送る日（JST）にだけ返す。前日・翌日は返さない", () => {
    expect(announcementForToday(jst("2026-09-09T08:30:00"))?.key).toBe("easy_setup_2026-09-09");
    expect(announcementForToday(jst("2026-09-09T00:05:00"))?.key).toBe("easy_setup_2026-09-09");
    expect(announcementForToday(jst("2026-09-08T23:55:00"))).toBeNull();
    expect(announcementForToday(jst("2026-09-10T08:30:00"))).toBeNull();
  });

  it("文面はLINEの1通に収まり、初心者向けの言葉で書かれている", () => {
    for (const a of DAILY_ANNOUNCEMENTS) {
      expect(Array.from(a.text).length).toBeLessThan(2000);
      // 内部用語を使わない（お客様に見せない言葉）
      for (const ng of ["adminReview", "styleSamples", "postback", "quick", "API", "プロンプト"]) expect(a.text).not.toContain(ng);
      // 変わった点が「5問」「きょうの1問」「次にやること」の言葉で説明されている
      expect(a.text).toContain("5問");
      expect(a.text).toContain("きょうの1問");
      expect(a.text).toContain("次にやること");
    }
  });
});

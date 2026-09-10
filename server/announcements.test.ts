import { describe, it, expect } from "vitest";
import { announcementForToday, DAILY_ANNOUNCEMENTS, renderAnnouncement } from "../shared/announcements";

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
    }
    // 9/9：変わった点が「5問」「きょうの1問」「次にやること」の言葉で説明されている
    const a909 = DAILY_ANNOUNCEMENTS.find((a) => a.key === "easy_setup_2026-09-09")!;
    expect(a909.text).toContain("5問");
    expect(a909.text).toContain("きょうの1問");
    expect(a909.text).toContain("次にやること");
    // 9/11：既存の方が混乱しないよう「変わらない」を先に、戻し方（設定）を必ず書く（2026-09-10 三上様指示）
    const a911 = DAILY_ANNOUNCEMENTS.find((a) => a.key === "morning_digest_2026-09-11")!;
    const pro = renderAnnouncement(a911, { maxPerDay: 3, requireApproval: true, metaAiEnabled: true });
    expect(pro.indexOf("変わりません")).toBeLessThan(pro.indexOf("■ 1."));
    expect(pro).toContain("「設定」");
    expect(pro).toContain("7:40");
    expect(pro).toContain("■ 4. ");
    expect(Array.from(pro).length).toBeLessThan(2000);
  });

  it("その方に当てはまる段落だけを出す（2026-09-10 三上様指示）", () => {
    const a911 = DAILY_ANNOUNCEMENTS.find((a) => a.key === "morning_digest_2026-09-11")!;
    // ライト（Meta AIなし）・確認あり：Meta AIの段落は出ない。番号は詰まる
    const light = renderAnnouncement(a911, { maxPerDay: 1, requireApproval: true, metaAiEnabled: true });
    expect(light).not.toContain("Meta AI");
    expect(light).toContain("■ 3. 「自動（確認なし）にしませんか」");
    // 自動（確認なし）の方：承認の話と「自動にしませんか」は出ない
    const auto = renderAnnouncement(a911, { maxPerDay: 3, requireApproval: false, metaAiEnabled: false });
    expect(auto).not.toContain("承認カード");
    expect(auto).not.toContain("自動（確認なし）にしませんか");
    expect(auto).toContain("■ 2. 投稿が作れなかった日は、翌日に足します");
    // 自動投稿の無いプラン：1と結びの文だけ
    const free = renderAnnouncement(a911, { maxPerDay: 0, requireApproval: true, metaAiEnabled: true });
    expect(free).toContain("■ 1. ");
    expect(free).not.toContain("■ 2. ");
    expect(free).toContain("このLINEに文章で送ってください");
  });
});

import { describe, it, expect } from "vitest";
import { ROTATION, stepForDay, shouldSendToday, isCoachTarget, worryWordFor, bizWordFor, cityWordFor, fill, searchUrl, ENGAGEMENT_COACH } from "../shared/engagementCoach";
import { firstVisitCheck } from "../shared/profileAdvice";

describe("毎日5分の交流の案内", () => {
  it("日替わりで順番に回る", () => {
    expect(stepForDay(0).key).toBe(ROTATION[0]!.key);
    expect(stepForDay(ROTATION.length).key).toBe(ROTATION[0]!.key);
    expect(stepForDay(1).key).toBe(ROTATION[1]!.key);
  });
  it("止めた人・今日送った人には送らない。3日続けて「やった」が無ければ3日おき", () => {
    expect(shouldSendToday({ enabled: false, lastSentYmd: null, missStreak: 0 }, "2026-10-21")).toBe(false);
    expect(shouldSendToday({ enabled: true, lastSentYmd: "2026-10-21", missStreak: 0 }, "2026-10-21")).toBe(false);
    expect(shouldSendToday({ enabled: true, lastSentYmd: "2026-10-20", missStreak: 1 }, "2026-10-21")).toBe(true);
    expect(shouldSendToday({ enabled: true, lastSentYmd: "2026-10-20", missStreak: 3 }, "2026-10-21")).toBe(false);
    expect(shouldSendToday({ enabled: true, lastSentYmd: "2026-10-18", missStreak: 3 }, "2026-10-21")).toBe(true);
    // 運営は「やった」が無くても毎日（10/23）
    expect(shouldSendToday({ enabled: true, lastSentYmd: "2026-10-20", missStreak: 5, alwaysDaily: true }, "2026-10-21")).toBe(true);
  });
  it("最初は運営の会員だけ（mode=trial）", () => {
    expect(ENGAGEMENT_COACH.mode).toBe("trial");
    expect(isCoachTarget(78, null)).toBe(true);
    expect(isCoachTarget(1234, new Date())).toBe(false);
  });
  it("検索の言葉と差し込み", () => {
    expect(worryWordFor("整骨院・接骨院")).toBe("腰痛");
    expect(worryWordFor("ピラティススタジオ")).toBe("姿勢");
    expect(bizWordFor("整体院（自費）")).toBe("整体院");
    expect(bizWordFor("整体院で自律神経の調整をやっています")).toBe("整体院");
    expect(bizWordFor("便利屋さんと地域の何でも相談をしています")).toBe("同業");

    expect(cityWordFor("滑川市上小泉1818-1")).toBe("滑川市");
    expect(cityWordFor("岡山県倉敷市玉島八島606-5")).toBe("倉敷市");
    expect(cityWordFor("東京都世田谷区三軒茶屋1-2")).toBe("世田谷区");
    expect(cityWordFor("香取郡神崎町")).toBe("香取郡神崎町");
    expect(cityWordFor("なし")).toBe("");
    expect(fill("{area}の{biz}で{worry}", { area: "倉敷", biz: "整体院", worry: "腰痛" })).toBe("倉敷の整体院で腰痛");
    expect(searchUrl("倉敷", "腰痛")).toContain(encodeURIComponent("倉敷 腰痛"));
  });
  it("案内に、自動では押さない作業だけが入っている（連打・使い回し・宣伝をしないと書いてある）", () => {
    const all = ROTATION.map((s) => s.title + s.body).join("\n");
    expect(all).toMatch(/興味なし/);
    expect(all).toMatch(/10個まで/);
    expect(all).not.toMatch(/http/);
  });
});

describe("初めての方への案内（プロフィール点検）", () => {
  it("「初めての方は」があれば○、無ければ△", () => {
    expect(firstVisitCheck("倉敷の整体院です。初めての方は60分のご相談から").mark).toBe("○");
    expect(firstVisitCheck("倉敷の整体院です。腰痛・肩こり").mark).toBe("△");
  });
});

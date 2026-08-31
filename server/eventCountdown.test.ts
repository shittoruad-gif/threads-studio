import { describe, it, expect } from "vitest";
import { planCountdownSlots, COUNTDOWN_STAGES, formatEventDateJst, jstDateStart } from "../shared/eventCountdown";
import { buildFallbackPost } from "./eventAnnounce";

describe("イベント告知の逆算スケジュール", () => {
  it("段階は5つ（14/7/3/1/0日前）で時刻が実測の反応帯に合っている", () => {
    expect(COUNTDOWN_STAGES.map(s => s.daysBefore)).toEqual([14, 7, 3, 1, 0]);
    expect(COUNTDOWN_STAGES.map(s => s.hourJst)).toEqual([15, 15, 15, 18, 9]);
  });

  it("開催日が十分先なら5スロット全部が返る", () => {
    const now = new Date("2026-09-01T00:00:00+09:00");
    const slots = planCountdownSlots("2026-09-20", now);
    expect(slots).toHaveLength(5);
    // 14日前スロット = 9/6 15:00 JST
    expect(slots[0].scheduledAt.toISOString()).toBe(new Date("2026-09-06T15:00:00+09:00").toISOString());
    // 当日スロット = 9/20 9:00 JST
    expect(slots[4].scheduledAt.toISOString()).toBe(new Date("2026-09-20T09:00:00+09:00").toISOString());
  });

  it("開催日が近い場合は残りの回だけ返る", () => {
    const now = new Date("2026-09-18T12:00:00+09:00");
    const slots = planCountdownSlots("2026-09-20", now); // 2日後開催
    expect(slots.map(s => s.stage.daysBefore)).toEqual([1, 0]); // 前日・当日のみ
  });

  it("当日の朝（9時前）に登録すれば当日分だけ返る", () => {
    const now = new Date("2026-09-20T07:00:00+09:00");
    const slots = planCountdownSlots("2026-09-20", now);
    expect(slots.map(s => s.stage.daysBefore)).toEqual([0]);
  });

  it("開催日が過ぎていれば空", () => {
    const now = new Date("2026-09-21T00:00:00+09:00");
    expect(planCountdownSlots("2026-09-20", now)).toEqual([]);
  });

  it("直近すぎるスロット（20分以内）は外す", () => {
    const now = new Date("2026-09-20T08:50:00+09:00"); // 当日9:00の10分前
    expect(planCountdownSlots("2026-09-20", now)).toEqual([]);
  });

  it("不正な日付は空", () => {
    expect(planCountdownSlots("invalid", new Date())).toEqual([]);
  });

  it("日付表示はJST基準", () => {
    expect(formatEventDateJst("2026-09-20")).toBe("9月20日");
    expect(jstDateStart("2026-09-20").toISOString()).toBe("2026-09-19T15:00:00.000Z");
  });
});

describe("フォールバック文（AI失敗時・事実のみ）", () => {
  const ev = { id: 1, title: "3周年感謝祭", eventDate: "2026-09-20", eventTime: "14:00〜16:00", venue: "店内", offer: "予約不要・当日ご来店ください" };

  it("事前告知は開催日を、前日・当日はその旨を書く", () => {
    expect(buildFallbackPost(ev, 7)).toContain("9月20日に開催します");
    expect(buildFallbackPost(ev, 1)).toContain("いよいよ明日です");
    expect(buildFallbackPost(ev, 0)).toContain("本日開催です");
  });

  it("登録された事実だけで構成される", () => {
    const t = buildFallbackPost(ev, 3);
    expect(t).toContain("3周年感謝祭");
    expect(t).toContain("14:00〜16:00");
    expect(t).toContain("店内");
    expect(t).toContain("予約不要");
  });

  it("任意項目が空なら行ごと出さない", () => {
    const t = buildFallbackPost({ id: 2, title: "体験会", eventDate: "2026-09-20" }, 3);
    expect(t).not.toContain("場所：");
    expect(t).not.toContain("時間：");
  });
});

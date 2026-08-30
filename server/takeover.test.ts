import { describe, it, expect } from "vitest";
import {
  TAKEOVER_GRACE_DAYS, takeoverExpired, takeoverDaysLeft, isTakeoverTargetPlan,
} from "../shared/takeover";

const DAY = 24 * 60 * 60 * 1000;

describe("代理店解約の引き継ぎ猶予", () => {
  const start = new Date("2026-08-30T00:00:00+09:00");

  it("猶予は30日", () => {
    expect(TAKEOVER_GRACE_DAYS).toBe(30);
  });

  it("開始直後は残り30日・期限切れではない", () => {
    expect(takeoverDaysLeft(start, start)).toBe(30);
    expect(takeoverExpired(start, start)).toBe(false);
  });

  it("29日後は残り1日", () => {
    const now = new Date(start.getTime() + 29 * DAY);
    expect(takeoverDaysLeft(start, now)).toBe(1);
    expect(takeoverExpired(start, now)).toBe(false);
  });

  it("30日ちょうどで期限切れ（残り0日）", () => {
    const now = new Date(start.getTime() + 30 * DAY);
    expect(takeoverDaysLeft(start, now)).toBe(0);
    expect(takeoverExpired(start, now)).toBe(true);
  });

  it("大幅に過ぎても残り日数はマイナスにならない", () => {
    const now = new Date(start.getTime() + 90 * DAY);
    expect(takeoverDaysLeft(start, now)).toBe(0);
  });

  it("文字列の日時（DBからの値）でも判定できる", () => {
    const now = new Date(start.getTime() + 5 * DAY);
    expect(takeoverDaysLeft("2026-08-30T00:00:00+09:00", now)).toBe(25);
  });

  it("引き継ぎ先は通常3プランのみ", () => {
    expect(isTakeoverTargetPlan("light")).toBe(true);
    expect(isTakeoverTargetPlan("pro")).toBe(true);
    expect(isTakeoverTargetPlan("business")).toBe(true);
    expect(isTakeoverTargetPlan("agency")).toBe(false);
    expect(isTakeoverTargetPlan("agency_client")).toBe(false);
    expect(isTakeoverTargetPlan("pro_campaign")).toBe(false);
    expect(isTakeoverTargetPlan("free")).toBe(false);
  });
});

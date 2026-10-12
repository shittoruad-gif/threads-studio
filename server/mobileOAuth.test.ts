import { describe, it, expect } from "vitest";
import { isPhoneLike } from "../shared/mobileOAuth";

describe("isPhoneLike（スマホで連携を押したときの案内）", () => {
  it("iPhone・Android・iPad はスマホ扱い", () => {
    expect(isPhoneLike("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe(true);
    expect(isPhoneLike("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36")).toBe(true);
    expect(isPhoneLike("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Line/14.0.0")).toBe(true);
    // iPadOS の Safari は Mac の表記＋タッチ
    expect(isPhoneLike("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15", 5)).toBe(true);
  });
  it("パソコンはそのまま飛ぶ", () => {
    expect(isPhoneLike("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36", 0)).toBe(false);
    expect(isPhoneLike("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36")).toBe(false);
    expect(isPhoneLike("")).toBe(false);
  });
});

/**
 * 案を確認しやすい時間（2026-09-24 三上様指示・shared/reviewTime.ts）。
 */
import { describe, it, expect } from "vitest";
import {
  normalizeReviewHour, isEveningReview, isDaytimeReview, eveningGenerationHour, hoursAfterReview, reviewHourReply,
  REVIEW_HOUR_OPTIONS,
} from "@shared/reviewTime";

describe("時間の見分け", () => {
  it("未設定は今までどおり（朝も夜も当てはまらない）", () => {
    for (const h of [null, undefined, "", 24, -1, 7.5, "abc"]) {
      expect(normalizeReviewHour(h)).toBeNull();
      expect(isEveningReview(h as any)).toBe(false);
      expect(isDaytimeReview(h as any)).toBe(false);
    }
  });
  it("昼12時＝朝に作る／夜9時・夕方6時＝前の晩に作る", () => {
    expect(isDaytimeReview(7)).toBe(true);
    expect(isDaytimeReview(12)).toBe(true);
    expect(isEveningReview(12)).toBe(false);
    expect(isEveningReview(18)).toBe(true);
    expect(isEveningReview(21)).toBe(true);
    expect(isDaytimeReview(21)).toBe(false);
  });
  it("夜の生成は確認の30分前（夜9時→20時半の回）", () => {
    expect(eveningGenerationHour(21)).toBe(20);
    expect(eveningGenerationHour(18)).toBe(17);
  });
  it("選択肢はすべて見分けられる", () => {
    for (const o of REVIEW_HOUR_OPTIONS) expect(isDaytimeReview(o.hour) || isEveningReview(o.hour)).toBe(true);
  });
});

describe("昼までに確認される方の投稿時間", () => {
  it("12時に確認 → 13時より前の枠は使わない。優先順は保つ", () => {
    const h = hoursAfterReview([21, 15, 22], 12);
    expect(h.slice(0, 3)).toEqual([21, 15, 22]);
    expect(h.every((x) => x >= 13)).toBe(true);
    expect(h.length).toBeGreaterThanOrEqual(4);
  });
  it("実績の時間に朝の枠があっても外す（例：7時・12時）", () => {
    const h = hoursAfterReview([7, 12, 20], 12);
    expect(h).not.toContain(7);
    expect(h).not.toContain(12);
    expect(h[0]).toBe(20);
  });
  it("時間の実績が無くても4つ返す", () => {
    const h = hoursAfterReview(null, 7);
    expect(h.length).toBeGreaterThanOrEqual(4);
    expect(h.every((x) => x >= 8)).toBe(true);
  });
});

describe("お返事", () => {
  it("夜9時 → 前の日の夜9時に翌日の案", () => {
    expect(reviewHourReply(21)).toContain("前の日の夜9時ごろ");
    expect(reviewHourReply(21)).toContain("翌日");
  });
  it("昼12時 → 公開は13時以降", () => {
    expect(reviewHourReply(12)).toContain("13時以降");
  });
  it("未設定 → 今までどおり朝6時", () => {
    expect(reviewHourReply(null)).toContain("朝6時");
  });
});

describe("お尋ねの文（既存のお客様へのお知らせの決まり）", () => {
  it("「変わらないこと」を先に書き、戻し方（選び直し方）も書く", async () => {
    const { REVIEW_HOUR_QUESTION } = await import("@shared/reviewTime");
    expect(REVIEW_HOUR_QUESTION.split("\n")[0]).toContain("これまでどおり");
    expect(REVIEW_HOUR_QUESTION).toContain("選び直せます");
  });
});

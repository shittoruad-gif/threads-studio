import { describe, it, expect } from "vitest";
import { isLineQuotaError } from "./lineNotify";
import { rampCap, rampDayLabel, rampNote } from "../shared/accountRamp";

/**
 * 2026-09-09、LINE無料枠200通を使い切り、24時間で push が22件すべて 429 になった。
 * 承認依頼も投稿のお知らせも、どなたにも届かないまま消えていた。
 * 枠切れは「黙って消さず、メールで同じ内容をお届けする」ところまでを自動でやる。
 */
describe("LINEの月間通数の切れを見分ける", () => {
  it("実際に返ってきた本文を枠切れと判定する", () => {
    const body = JSON.stringify({ message: "You have reached your monthly limit." });
    expect(isLineQuotaError(429, body)).toBe(true);
  });

  it("同じ429でも、短時間の送りすぎ（rate limit）は枠切れにしない", () => {
    expect(isLineQuotaError(429, JSON.stringify({ message: "Too Many Requests" }))).toBe(false);
  });

  it("ブロック・宛先不正（400）は枠切れではない", () => {
    expect(isLineQuotaError(400, JSON.stringify({ message: "The property, 'to', in the request body is invalid" }))).toBe(false);
  });
});

/**
 * 慣らし運転の日数表示が、生成側（「8日目」）と公開側（「7日目」）で1日ずれていた。
 * お客様に見せる日数は必ず rampDayLabel を通す（連携した日が1日目）。
 */
describe("慣らし運転の日数の数え方をそろえる", () => {
  it("連携したその日は「1日目」", () => {
    expect(rampDayLabel(0)).toBe(1);
    expect(rampDayLabel(7)).toBe(8);
  });

  it("生成側の案内文と、公開側の見送り文の日数が一致する", () => {
    const days = rampCap(3, "2026-09-01T00:00:00Z", Date.parse("2026-09-08T13:00:00Z")).days;
    expect(days).toBe(7);
    expect(rampNote(days, 3)).toContain(`${rampDayLabel(days)}日目`); // 生成側
    expect(`連携から${rampDayLabel(days)}日目`).toContain("8日目");   // 公開側
  });

  it("1〜5日目は1日1件、6〜10日目は1日2件", () => {
    const at = (d: string) => rampCap(3, "2026-09-01T00:00:00Z", Date.parse(d));
    expect(at("2026-09-01T09:00:00Z").count).toBe(1); // 1日目
    expect(at("2026-09-05T09:00:00Z").count).toBe(1); // 5日目
    expect(at("2026-09-06T09:00:00Z").count).toBe(2); // 6日目
    expect(at("2026-09-10T09:00:00Z").count).toBe(2); // 10日目
    expect(at("2026-09-11T09:00:00Z").count).toBe(3); // 11日目＝契約どおり
  });
});

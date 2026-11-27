import { describe, it, expect } from "vitest";
import { wantsProfileCta, hasProfileCta, PROFILE_CTA } from "../shared/profileCta";

describe("プロフィールのリンクへ軽く誘う一文は10本に1本（2026-11-27）", () => {
  it("直近9本に案内の一文が無ければ付ける・あれば付けない", () => {
    const plain = Array.from({ length: 9 }, (_, i) => `ふつうの投稿${i}`);
    expect(wantsProfileCta(24, plain)).toBe(true);
    const withCta = [...plain.slice(0, 8), "ご相談は、プロフィールのリンクから公式LINEへどうぞ"];
    expect(wantsProfileCta(24, withCta)).toBe(false);
    // 10本前より古い案内は数えない
    expect(wantsProfileCta(24, [...plain, "ご予約は、プロフィールのリンクからどうぞ"])).toBe(true);
  });
  it("プロフィールにリンクが無いと分かっているアカウントには付けない", () => {
    for (const id of PROFILE_CTA.noProfileLink) expect(wantsProfileCta(id, [])).toBe(false);
    expect(PROFILE_CTA.noProfileLink).toContain(38);
  });
  it("案内の一文の見分け", () => {
    expect(hasProfileCta("詳しくは、プロフィールのリンクからご覧ください")).toBe(true);
    expect(hasProfileCta("プロフィールを見てね")).toBe(false);
  });
});

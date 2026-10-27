import { describe, it, expect } from "vitest";
import { isProOrAbove, mediaPostsEnabledFor, pickMedia, mediaPostNote, MEDIA_POSTS } from "../shared/mediaPosts";

describe("写真・動画の自動投稿（プロ以上のみ）", () => {
  it("プロ・ビジネス（特別価格・モニター価格を含む）だけ", () => {
    for (const p of ["pro", "pro_campaign", "pro_seminar", "business", "business_campaign", "business_seminar"]) expect(isProOrAbove(p)).toBe(true);
    for (const p of ["light", "light_campaign", "light_seminar", "free", "", null]) expect(isProOrAbove(p as any)).toBe(false);
  });
  // 2026-10-28：新しい契約はプロ以上だけ → mode=on（プロ以上の全員）
  it("mode=on：プロ以上なら誰でも・ライトや無料は使えない・運営の会員はプランに関係なく使える", () => {
    expect(MEDIA_POSTS.mode).toBe("on");
    expect(MEDIA_POSTS.trialUserIds).toContain(78);
    expect(mediaPostsEnabledFor(1234, "pro")).toBe(true);
    expect(mediaPostsEnabledFor(1234, "business_campaign")).toBe(true);
    expect(mediaPostsEnabledFor(1234, "light")).toBe(false);
    expect(mediaPostsEnabledFor(1234, null)).toBe(false);
    expect(mediaPostsEnabledFor(78, "pro")).toBe(true);
    expect(mediaPostsEnabledFor(78, null)).toBe(true);
  });
  it("動画を先に・使った回数が少ないもの・2週間あけたものだけ", () => {
    const now = Date.parse("2026-10-26T12:00:00Z");
    const d = (days: number) => new Date(now - days * 86400e3);
    const items = [
      { id: 1, kind: "image", usedCount: 0, lastUsedAt: null, createdAt: d(30), enabled: 1 },
      { id: 2, kind: "video", usedCount: 1, lastUsedAt: d(3), createdAt: d(20), enabled: 1 },
      { id: 3, kind: "video", usedCount: 2, lastUsedAt: d(20), createdAt: d(25), enabled: 1 },
      { id: 4, kind: "image", usedCount: 0, lastUsedAt: null, createdAt: d(1), enabled: 0 },
    ];
    expect(pickMedia(items, now)!.id).toBe(3);
    expect(pickMedia(items.filter((x) => x.kind === "image"), now)!.id).toBe(1);
    expect(pickMedia([items[1]!], now)).toBeNull();
  });
  it("生成の指示：写っていないこと・人のこと・宣伝を書かせない", () => {
    const n = mediaPostNote("image", "店の入口と秋の植木");
    expect(n).toContain("店の入口と秋の植木");
    expect(n).toMatch(/写っていない物・人・数字・効果は書かない/);
    expect(n).toMatch(/宣伝の言葉・予約の案内・URL/);
    expect(mediaPostNote("video", null)).toContain("動画");
  });
});

import { describe, it, expect } from "vitest";
import {
  inquiryCommentText, inquiryKeywordForPost,
  ACTIVE_INQUIRY_KEYWORDS, NON_LOCAL_INQUIRY_KEYWORDS,
} from "../shared/inquiryKeywords";

describe("流入計測コメント", () => {
  it("公式LINEが無ければコメントしない", () => {
    expect(inquiryCommentText(600, { hasLineLink: false })).toBeNull();
  });

  it("来店を伴わない業種に「予約」「空き状況」「アクセス」と言わせない（実際に起きた事故）", () => {
    for (let id = 537; id < 537 + 20; id++) {
      const t = inquiryCommentText(id, { hasLineLink: true, isLocalBusiness: false })!;
      expect(t).not.toMatch(/予約|空き状況|アクセス/);
    }
  });

  it("来店型では従来の合言葉を保つ（過去の集計を壊さない）", () => {
    for (let id = 537; id < 537 + 10; id++) {
      expect(inquiryKeywordForPost(id, true))
        .toBe(ACTIVE_INQUIRY_KEYWORDS[id % ACTIVE_INQUIRY_KEYWORDS.length]);
    }
  });

  it("切替前の投稿IDは旧合言葉のまま（過去の集計を壊さない）", () => {
    expect(inquiryKeywordForPost(500, false)).toBe(inquiryKeywordForPost(500, true));
  });

  it("「固定投稿にある」と言わない（実際はプロフィールのリンク）", () => {
    const t = inquiryCommentText(600, { hasLineLink: true })!;
    expect(t).not.toContain("固定投稿");
    expect(t).toContain("プロフィールのリンク");
  });

  it("合言葉は投稿ごとに決まり、同じIDなら常に同じ", () => {
    expect(inquiryKeywordForPost(601, false)).toBe(inquiryKeywordForPost(601, false));
    expect(NON_LOCAL_INQUIRY_KEYWORDS.length).toBeGreaterThan(1);
  });
});

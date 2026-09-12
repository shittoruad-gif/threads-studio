import { describe, it, expect } from "vitest";
import { inferLinkTypeFromUrl, normalizeLinkType, parseProjectLinks } from "../shared/projectLinks";

describe("ご案内先URLの種類はドメインで決める（2026-09-12 三上様指摘）", () => {
  it("ドメインから種類を推定する", () => {
    expect(inferLinkTypeFromUrl("https://lin.ee/ZB0cQ0h")).toBe("line");
    expect(inferLinkTypeFromUrl("https://www.instagram.com/moveact_seitai/")).toBe("instagram");
    expect(inferLinkTypeFromUrl("https://youtu.be/abc")).toBe("youtube");
    expect(inferLinkTypeFromUrl("https://beauty.hotpepper.jp/slnH000123456/")).toBe("reservation");
    expect(inferLinkTypeFromUrl("https://ig-ads.s-toru.com/")).toBeNull();
    expect(inferLinkTypeFromUrl("not a url")).toBeNull();
  });
  it("「Instagram」と登録された広告LPは公式HPに直し、ラベルも種類名に置き換える", () => {
    const fixed = normalizeLinkType({ id: "x", type: "instagram", label: "Instagram", url: "https://ig-ads.s-toru.com/" });
    expect(fixed.type).toBe("website");
    expect(fixed.label).toBe("公式HP");
  });
  it("本当にInstagramのURLならそのまま。お客様が付けた独自ラベルは残す", () => {
    const ok = normalizeLinkType({ id: "x", type: "instagram", label: "日々の施術風景", url: "https://instagram.com/abc" });
    expect(ok.type).toBe("instagram");
    expect(ok.label).toBe("日々の施術風景");
    const fixed = normalizeLinkType({ id: "y", type: "line", label: "ご予約はこちら", url: "https://beauty.hotpepper.jp/x" });
    expect(fixed.type).toBe("reservation");
    expect(fixed.label).toBe("ご予約はこちら");
  });
  it("保存済みの登録内容を読むときも直る（固定投稿のコメント文が「ふだんの様子」にならない）", () => {
    const links = parseProjectLinks(JSON.stringify([{ id: "a", type: "instagram", label: "Instagram", url: "https://ig-ads.s-toru.com/", isDefault: true }]));
    expect(links[0].type).toBe("website");
  });
});

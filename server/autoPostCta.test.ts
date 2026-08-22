import { describe, it, expect } from "vitest";
import { buildCtaText } from "../shared/autoPostCta";

const LINE_LINK = JSON.stringify([
  { id: "line-main", type: "line", label: "公式LINE", url: "https://line.example/abc", isDefault: true },
]);
const RESERVE_LINK = JSON.stringify([
  { id: "r", type: "reservation", label: "ネット予約", url: "https://reserve.example/x" },
]);
const SITE_LINK = JSON.stringify([
  { id: "w", type: "website", label: "ホームページ", url: "https://example.com" },
]);

describe("自動投稿のCTA", () => {
  it("公式LINEが登録されていればLINEへ案内する", () => {
    const cta = buildCtaText({ links: LINE_LINK, businessType: "整体院" })!;
    expect(cta).toContain("公式LINE");
    expect(cta).toContain("ご相談・ご予約");
  });

  it("LINEが無いのにLINEへ案内しない（実際に起きた事故）", () => {
    for (const p of [
      { links: null, ctaLink: "https://lp.example.com/", businessType: "Web集客支援" },
      { links: "[]", ctaLink: null, businessType: "鍼灸整骨院" },
      { links: SITE_LINK, businessType: "整体院" },
      { links: RESERVE_LINK, businessType: "整体院" },
    ]) {
      expect(buildCtaText(p) ?? "").not.toContain("LINE");
    }
  });

  it("案内先が1つも無ければCTAを付けない", () => {
    expect(buildCtaText({ links: "[]", ctaLink: null, businessType: "鍼灸整骨院" })).toBeNull();
    expect(buildCtaText({ links: null, ctaLink: "  ", businessType: "整体院" })).toBeNull();
  });

  it("来店を伴わない業種に「ご予約」と言わない", () => {
    const cta = buildCtaText({ links: LINE_LINK, businessType: "Web集客支援・広告運用" })!;
    expect(cta).toContain("ご相談");
    expect(cta).not.toContain("ご予約");
  });

  it("ネット予約があれば予約へ案内する", () => {
    const cta = buildCtaText({ links: RESERVE_LINK, businessType: "整体院" })!;
    expect(cta).toContain("ご予約");
  });

  it("旧形式の単一URLだけでも案内はする（ただしLINEとは言わない）", () => {
    const cta = buildCtaText({ links: null, ctaLink: "https://lp.example.com/", businessType: "Web制作" })!;
    expect(cta).toBe("詳しくは、プロフィールのリンクからご覧ください😊");
  });

  it("「初回体験」という決めつけをしない", () => {
    for (const p of [
      { links: LINE_LINK, businessType: "整体院" },
      { links: RESERVE_LINK, businessType: "美容室" },
      { links: SITE_LINK, businessType: "Web制作" },
    ]) {
      expect(buildCtaText(p) ?? "").not.toContain("初回体験");
    }
  });
});

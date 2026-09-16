import { describe, it, expect } from "vitest";
import { currentPlanCardId, campaignPriceLabel, PLANS } from "../shared/plans";

/**
 * 料金ページで、セミナー価格・モニター価格の契約中に「現在のプラン」が出なかった（R11）。
 *
 * 2026-09-16 梅原様（pro_seminar）から「無料プランと表示される」というお問い合わせ。
 * カード一覧はキャンペーンプランを除いて作るのに、印の判定は生の planId 比較だったため、
 * pro_seminar はどのカードにも一致せず、ご契約中なのに印が1つも付かない画面になっていた。
 */
describe("料金ページの「現在のプラン」の印（R11）", () => {
  it("セミナー価格は、元の通常プランのカードに印を付ける", () => {
    expect(currentPlanCardId("pro_seminar")).toBe("pro");
    expect(currentPlanCardId("light_seminar")).toBe("light");
    expect(currentPlanCardId("business_seminar")).toBe("business");
  });

  it("モニター価格も同じ", () => {
    expect(currentPlanCardId("pro_campaign")).toBe("pro");
    expect(currentPlanCardId("light_campaign")).toBe("light");
    expect(currentPlanCardId("business_campaign")).toBe("business");
  });

  it("通常プランはそのまま", () => {
    for (const id of ["free", "light", "pro", "business", "agency"]) {
      expect(currentPlanCardId(id)).toBe(id);
    }
  });

  it("未契約（planIdなし）は印を付けない", () => {
    expect(currentPlanCardId(null)).toBeNull();
    expect(currentPlanCardId(undefined)).toBeNull();
    expect(currentPlanCardId("")).toBeNull();
  });

  it("キャンペーン価格には呼び名を添える（通常プランには付けない）", () => {
    expect(campaignPriceLabel("pro_seminar")).toBe("セミナー価格");
    expect(campaignPriceLabel("light_campaign")).toBe("モニター価格");
    expect(campaignPriceLabel("pro")).toBeNull();
    expect(campaignPriceLabel(null)).toBeNull();
  });

  it("すべてのキャンペーンプランが、カード一覧に出ている通常プランへ向いている", () => {
    // 料金ページのカード一覧と同じ絞り込み
    const cardIds = new Set(
      Object.values(PLANS).filter((p) => !p.isCampaign && p.id !== "agency_client").map((p) => p.id),
    );
    for (const p of Object.values(PLANS)) {
      if (!p.isCampaign) continue;
      const target = currentPlanCardId(p.id);
      expect(cardIds.has(String(target))).toBe(true);
      expect(campaignPriceLabel(p.id)).toBeTruthy();
    }
  });
});

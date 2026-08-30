import { describe, it, expect } from "vitest";
import { getMaxLineLinks, PLANS } from "../shared/plans";

describe("LINE連携のプラン別上限", () => {
  it("ライト1人・プロ2人・ビジネス無制限", () => {
    expect(getMaxLineLinks("light")).toBe(1);
    expect(getMaxLineLinks("pro")).toBe(2);
    expect(getMaxLineLinks("business")).toBe(-1);
  });

  it("キャンペーンプランは通常プランと同じ上限を引き継ぐ", () => {
    expect(getMaxLineLinks("light_campaign")).toBe(1);
    expect(getMaxLineLinks("pro_campaign")).toBe(2);
    expect(getMaxLineLinks("business_campaign")).toBe(-1);
  });

  it("フリー1人・代理店本体は無制限・代理店クライアントはプロ相当の2人", () => {
    expect(getMaxLineLinks("free")).toBe(1);
    expect(getMaxLineLinks("agency")).toBe(-1);
    expect(getMaxLineLinks("agency_client")).toBe(2);
  });

  it("不明なプラン・未指定は安全側の1人に倒す", () => {
    expect(getMaxLineLinks("unknown_plan")).toBe(1);
    expect(getMaxLineLinks(null)).toBe(1);
    expect(getMaxLineLinks(undefined)).toBe(1);
  });

  it("全プラン定義に maxLineLinks が入っている", () => {
    for (const [id, p] of Object.entries(PLANS)) {
      expect(typeof p.features.maxLineLinks, id).toBe("number");
    }
  });
});

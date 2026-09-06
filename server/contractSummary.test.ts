import { describe, it, expect } from "vitest";
import { contractSummary } from "../shared/contractSummary";

describe("ご契約内容の文面", () => {
  it("フリープランはお支払いなしと伝える", () => {
    const t = contractSummary({ planName: "フリー", priceMonthly: 0 });
    expect(t).toContain("フリープラン");
    expect(t).toContain("お支払いはございません");
  });

  it("契約が取れないときもフリー扱いで返す（無反応にしない）", () => {
    expect(contractSummary(null)).toContain("お支払いはございません");
  });

  it("お試し中は、いつから有料になるかを出す", () => {
    const t = contractSummary({
      planName: "プロ", priceMonthly: 6980, status: "trialing",
      trialEndsAt: "2026-09-14T00:00:00Z",
    });
    expect(t).toContain("プロ");
    expect(t).toContain("6,980円");
    expect(t).toContain("2026年9月14日");
    expect(t).toContain("初回のお支払い");
  });

  it("契約中は次回のご請求日を出す", () => {
    const t = contractSummary({
      planName: "ライト", priceMonthly: 2980, status: "active",
      currentPeriodEnd: "2026-10-01T00:00:00Z",
    });
    expect(t).toContain("次回のご請求日：2026年10月1日");
  });

  it("解約手続き済みなら、いつまで使えて以降は請求が無いことを出す", () => {
    const t = contractSummary({
      planName: "プロ", priceMonthly: 6980, status: "active",
      currentPeriodEnd: "2026-10-01T00:00:00Z", cancelAtPeriodEnd: true,
    });
    expect(t).toContain("2026年10月1日までお使いいただけます");
    expect(t).toContain("以降のお支払いはございません");
    expect(t).not.toContain("次回のご請求日");
  });

  it("日付が取れないときは、作った日付を出さない", () => {
    const t = contractSummary({ planName: "プロ", priceMonthly: 6980, status: "active" });
    expect(t).toContain("確認中");
    expect(t).not.toMatch(/\d+年\d+月\d+日/);
  });

  it("キャンペーン価格はその旨を添える", () => {
    const t = contractSummary({
      planName: "プロ（セミナー価格）", priceMonthly: 4480, status: "active",
      currentPeriodEnd: "2026-10-01T00:00:00Z", isCampaign: true,
    });
    expect(t).toContain("キャンペーン価格");
  });
});

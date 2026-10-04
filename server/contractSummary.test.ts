import { describe, it, expect } from "vitest";
import { contractSummary } from "../shared/contractSummary";

describe("ご契約内容の文面", () => {
  it("お申し込み前はお支払いなしと伝える（2026-10-03 フリープラン廃止）", () => {
    const t = contractSummary({ planName: "お申し込み前", priceMonthly: 0 });
    expect(t).toContain("お申し込み前");
    expect(t).toContain("7日間無料");
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

describe("次回の決済日は UnivaPay の日付を使う（2026-09-25：currentPeriodEnd は1日遅かった）", () => {
  it("UnivaPay の日付と金額があればそれを出し、currentPeriodEnd の日付は出さない", () => {
    const t = contractSummary({
      planName: "ライト（キャンペーン）", priceMonthly: 2980, status: "active",
      currentPeriodEnd: "2026-10-03T06:46:39Z", nextPaymentDate: "2026-10-02", nextPaymentAmount: 2980,
    });
    expect(t).toContain("次回のご請求日：2026年10月2日（金）（2,980円・税込）");
    expect(t).not.toContain("10月3日");
  });
  it("UnivaPay が読めないときは今までどおり", () => {
    const t = contractSummary({ planName: "プロ", priceMonthly: 6980, status: "active", currentPeriodEnd: "2026-10-03T06:46:39Z" });
    expect(t).toContain("次回のご請求日：");
  });
  it("曜日つきの日付（タイムゾーンに左右されない）", async () => {
    const { formatDueDate } = await import("@shared/contractSummary");
    expect(formatDueDate("2026-10-02")).toBe("2026年10月2日（金）");
    expect(formatDueDate("2026-10-08")).toBe("2026年10月8日（木）");
    expect(formatDueDate(null)).toBeNull();
    expect(formatDueDate("10/2")).toBeNull();
  });
});

describe("ご契約内容：状態ごとの文面（2026-10-04 点検）", () => {
  it("解約・猶予・お支払い確認中・クーポン・代理店クライアント", () => {
    expect(contractSummary({ planName: "お申し込み前", priceMonthly: 0, state: "ended", contractPlanName: "プロプラン" })).toMatch(/終了しています（プロプラン）/);
    expect(contractSummary({ planName: "お申し込み前", priceMonthly: 0, state: "grace" })).toMatch(/フリープラン（10月31日まで）/);
    expect(contractSummary({ planName: "お申し込み前", priceMonthly: 0, state: "dunning", contractPlanName: "プロプラン" })).toMatch(/お支払いの確認ができていません/);
    expect(contractSummary({ planName: "プロプラン", priceMonthly: 9800, status: "trialing", planId: "pro", hasPaymentContract: false })).toMatch(/期限なし・無料/);
    expect(contractSummary({ planName: "プロプラン", priceMonthly: 9800, status: "trialing", planId: "pro", hasPaymentContract: false, trialEndsAt: "2026-11-01T00:00:00Z" })).toMatch(/無料の体験・2026年11月1日まで/);
    expect(contractSummary({ planName: "代理店クライアント", priceMonthly: 0, planId: "agency_client" })).toMatch(/代理店のご契約に含まれています/);
  });
  it("キャンペーン価格は4回目から通常価格（無料に戻らない）", () => {
    const t = contractSummary({ planName: "プロ セミナー価格", priceMonthly: 6980, status: "active", isCampaign: true, nextPaymentDate: "2026-11-01" });
    expect(t).toMatch(/4回目から通常価格/);
    expect(t).not.toMatch(/無料に戻ります/);
  });
});

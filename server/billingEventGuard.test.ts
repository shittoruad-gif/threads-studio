import { describe, it, expect } from "vitest";
import { judgeBillingEvent } from "../shared/billingEventGuard";
import { contractNoticeText } from "./contractNotice";

// 2026-10-30 実際に届いた知らせ（別サービスの定期課金のカード登録し直し・1円のカード確認）
const cardUpdateEvent = {
  eventType: "charge_updated",
  dataType: "cvv_auth",
  metadata: { "univapay-name": "x", "univapay-link-id": "l", "univapay-patch-token-id": "t", "univapay-patch-subscription-id": "other-sub" },
  eventSubscriptionId: null,
  matchedPlanId: null,
};

describe("Threads Studio の契約を変えてはいけない決済の知らせ（10/30 解約済みの方の契約が戻った件）", () => {
  it("実際の知らせ：カード確認の1円は見送り・解約済みの方なら運営に知らせる", () => {
    const r = judgeBillingEvent({ ...cardUpdateEvent, existingStatus: "canceled", existingSubscriptionId: "ts-sub", wouldActivate: true });
    expect(r).toEqual({ ignore: true, reason: "card_check", notify: true });
  });
  it("カードの登録し直しは、cvv_auth の印が無くても見送る", () => {
    const r = judgeBillingEvent({ ...cardUpdateEvent, dataType: null, existingStatus: "active", existingSubscriptionId: "ts-sub", wouldActivate: true });
    expect(r.ignore).toBe(true);
    expect(r.reason).toBe("card_update");
    expect(r.notify).toBe(false); // いま使っている方は戻す話にならない
  });
  it("他のサービスの決済（定期課金の番号なし・プランの額でない）は、失敗の知らせでも契約に使わない", () => {
    expect(judgeBillingEvent({ eventType: "charge_finished", eventSubscriptionId: null, matchedPlanId: null, existingStatus: "active", existingSubscriptionId: "ts", wouldActivate: false }))
      .toEqual({ ignore: true, reason: "other_service_charge", notify: false });
  });
  it("別の定期課金でプランの額でない課金は見送る", () => {
    expect(judgeBillingEvent({ eventType: "charge_finished", eventSubscriptionId: "other", matchedPlanId: null, existingStatus: "canceled", existingSubscriptionId: "ts", wouldActivate: true }))
      .toEqual({ ignore: true, reason: "other_subscription", notify: true });
  });
  it("解約済みの方を戻す知らせで、プランの額でないものは見送る", () => {
    expect(judgeBillingEvent({ eventType: "subscription_created", eventSubscriptionId: "s", matchedPlanId: null, existingStatus: "canceled", existingSubscriptionId: "old", wouldActivate: true }))
      .toEqual({ ignore: true, reason: "not_a_plan_amount", notify: true });
  });
  it("正しい知らせは通す：新しいお申し込み・毎月の更新・お試しから有料・予定のプラン変更", () => {
    // 新しいお申し込み（プランの額・定期課金の番号あり）
    expect(judgeBillingEvent({ eventType: "subscription_created", eventSubscriptionId: "new", matchedPlanId: "pro", existingStatus: null, wouldActivate: true }).ignore).toBe(false);
    // 初回の課金（定期課金の番号が無くてもプランの額なら通す）
    expect(judgeBillingEvent({ eventType: "charge_finished", eventSubscriptionId: null, matchedPlanId: "pro_seminar", existingStatus: null, wouldActivate: true }).ignore).toBe(false);
    // 毎月の更新（同じ定期課金・クーポンなどでプランの額と違っても通す）
    expect(judgeBillingEvent({ eventType: "charge_finished", eventSubscriptionId: "ts", matchedPlanId: null, existingStatus: "active", existingSubscriptionId: "ts", wouldActivate: true }).ignore).toBe(false);
    // お試しから有料へ
    expect(judgeBillingEvent({ eventType: "charge_finished", eventSubscriptionId: "ts", matchedPlanId: "pro", existingStatus: "trialing", existingSubscriptionId: "ts", wouldActivate: true }).ignore).toBe(false);
    // 解約済みの方の再申し込み（プランの額なら通す＝運営には「契約の再開」で知らせる）
    expect(judgeBillingEvent({ eventType: "charge_finished", eventSubscriptionId: "new", matchedPlanId: "pro", existingStatus: "canceled", existingSubscriptionId: "old", wouldActivate: true }).ignore).toBe(false);
    // 予定のプラン変更（額は変わる）
    expect(judgeBillingEvent({ eventType: "charge_finished", eventSubscriptionId: "ts", matchedPlanId: null, pendingPlanId: "light", existingStatus: "active", existingSubscriptionId: "ts", wouldActivate: true }).ignore).toBe(false);
    // Threads Studio の定期課金の解約の知らせ
    expect(judgeBillingEvent({ eventType: "subscription_canceled", eventSubscriptionId: "ts", matchedPlanId: null, existingStatus: "active", existingSubscriptionId: "ts", wouldActivate: false }).ignore).toBe(false);
  });
});

describe("契約・解約の知らせ（運営のLINE・メール）", () => {
  it("お店・プラン・金額・期間が一目で分かる", () => {
    const n = contractNoticeText("cancel_requested", { userId: 1, name: "山田", storeName: "山田整体院", email: "a@example.com", planId: "pro", amount: null, until: new Date("2026-11-05T15:00:00Z") });
    expect(n.title).toBe("【Threads Studio】解約のお手続き");
    expect(n.content).toContain("山田整体院／山田（user 1）");
    expect(n.content).toMatch(/プラン：プロ/);
    expect(n.content).toContain("使える期間：11/06 00:00まで");
    const m = contractNoticeText("trial_to_paid", { userId: 2, planId: "pro", fromPlanId: "pro", amount: 9800 });
    expect(m.content).toContain("金額：9,800円");
    expect(contractNoticeText("ignored", { userId: 3, detail: "理由：カード確認" }).title).toContain("見送り");
  });
});

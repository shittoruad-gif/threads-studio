import { describe, it, expect } from 'vitest';
import { PLANS, getCampaignCounterpart, getPlan } from '../shared/plans';

/**
 * Univapay Webhook は「課金金額 → プラン」の一致でプランを特定する。
 * 金額が重複するプランを作ると誤付与（別プランをactive化）が起きるため、
 * ここで恒久的にガードする。プラン追加時にこのテストが落ちたら、
 * 金額を変えるか、Webhook側の特定ロジックを金額以外（metadata等）に
 * 変更してからリリースすること。
 */
describe('プラン定義の整合性（Webhook誤付与ガード）', () => {
  it('有料プランの priceMonthly が互いに重複しない', () => {
    const paid = Object.values(PLANS).filter((p) => p.priceMonthly > 0);
    const seen = new Map<number, string>();
    for (const p of paid) {
      const dup = seen.get(p.priceMonthly);
      expect(
        dup,
        `プラン「${p.id}」と「${dup}」の priceMonthly が同額(¥${p.priceMonthly})。Webhookの金額一致でプラン特定できなくなるため金額を変えること`,
      ).toBeUndefined();
      seen.set(p.priceMonthly, p.id);
    }
  });

  it('キャンペーンプランは normalCounterpartId が実在プランを指す', () => {
    for (const p of Object.values(PLANS)) {
      if (p.isCampaign) {
        expect(p.normalCounterpartId, `${p.id} に normalCounterpartId がない`).toBeTruthy();
        expect(getPlan(p.normalCounterpartId!), `${p.id} の normalCounterpartId が実在しない`).toBeTruthy();
      }
    }
  });

  it('キャンペーンプランの campaignCharges が正の数', () => {
    for (const p of Object.values(PLANS)) {
      if (p.isCampaign) {
        expect(p.campaignCharges ?? 0, `${p.id} の campaignCharges 未設定`).toBeGreaterThan(0);
      }
    }
  });

  it('getCampaignCounterpart が tier ごとに正しいキャンペーンプランを返す', () => {
    expect(getCampaignCounterpart('light', 'seminar')?.id).toBe('light_seminar');
    expect(getCampaignCounterpart('pro', 'seminar')?.id).toBe('pro_seminar');
    expect(getCampaignCounterpart('business', 'seminar')?.id).toBe('business_seminar');
    expect(getCampaignCounterpart('light', 'monitor')?.id).toBe('light_campaign');
    expect(getCampaignCounterpart('pro', 'monitor')?.id).toBe('pro_campaign');
    expect(getCampaignCounterpart('business', 'monitor')?.id).toBe('business_campaign');
  });

  it('有料プランに Univapay リンクが設定されている', () => {
    for (const p of Object.values(PLANS)) {
      if (p.priceMonthly > 0 && p.id !== 'enterprise') {
        expect(p.univapayLinkUrl, `${p.id} に univapayLinkUrl がない`).toBeTruthy();
      }
    }
  });
});

import { describe, it, expect } from 'vitest';
import { effectiveSubscriptionStatus, resolveEffectivePlanId } from '../shared/plans';

// 2026-10-03 三上様「解約後は有料機能が全て使えないように徹底」
describe('契約のいまの状態', () => {
  const now = new Date('2026-10-02T03:00:00Z');
  it('解約の予約があり、使える期間を過ぎていれば canceled（DBがまだ active でも）', () => {
    const s = effectiveSubscriptionStatus({ status: 'active', cancelAtPeriodEnd: 1, currentPeriodEnd: '2026-10-01 15:00:00Z' }, now);
    expect(s).toBe('canceled');
    expect(resolveEffectivePlanId('pro_seminar', s)).toBe('free');
  });
  it('使える期間の中ならそのまま使える', () => {
    expect(effectiveSubscriptionStatus({ status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: new Date('2026-10-05T00:00:00Z') }, now)).toBe('active');
  });
  it('解約の予約が無ければ期限を見ない／決済失敗中の状態は変えない', () => {
    expect(effectiveSubscriptionStatus({ status: 'active', cancelAtPeriodEnd: 0, currentPeriodEnd: '2026-09-01 00:00:00Z' }, now)).toBe('active');
    expect(effectiveSubscriptionStatus({ status: 'past_due', cancelAtPeriodEnd: 1, currentPeriodEnd: '2026-09-01 00:00:00Z' }, now)).toBe('past_due');
  });
});

describe('クーポンの無料体験の終わり（2026-10-03）', () => {
  const now = new Date('2026-10-10T00:00:00Z');
  it('決済の契約が無い体験は、終わりの日を過ぎたら canceled', () => {
    expect(effectiveSubscriptionStatus({ status: 'trialing', trialEndsAt: '2026-10-09T00:00:00Z', univapaySubscriptionId: null }, now)).toBe('canceled');
  });
  it('終わりの日の前・期限なし（PROST2026）・カード登録の7日間体験は止めない', () => {
    expect(effectiveSubscriptionStatus({ status: 'trialing', trialEndsAt: '2026-10-11T00:00:00Z' }, now)).toBe('trialing');
    expect(effectiveSubscriptionStatus({ status: 'trialing', trialEndsAt: null }, now)).toBe('trialing');
    expect(effectiveSubscriptionStatus({ status: 'trialing', trialEndsAt: '2026-10-09T00:00:00Z', univapaySubscriptionId: 'uv-1' }, now)).toBe('trialing');
  });
});

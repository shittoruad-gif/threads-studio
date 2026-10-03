import { describe, it, expect } from 'vitest';
import { inFreeGrace, LEGACY_FREE_PLAN, FREE_PLAN_SUNSET } from '../shared/freePlanSunset';
import { PLANS } from '../shared/plans';

// 2026-10-03 三上様「フリープランは不要」→「今いる方は10月31日まで」
describe('フリープランの終了と猶予', () => {
  const now = new Date('2026-10-15T12:00:00+09:00');
  it('10/3までに登録し、契約の行が無い方は猶予中', () => {
    expect(inFreeGrace({ createdAt: '2026-09-06T10:00:00+09:00' }, false, now)).toBe(true);
    expect(inFreeGrace({ createdAt: '2026-10-03T23:59:00+09:00' }, false, now)).toBe(true);
  });
  it('10/4以降に登録した方・契約したことがある方（解約・クーポン終了）は対象外', () => {
    expect(inFreeGrace({ createdAt: '2026-10-04T00:00:00+09:00' }, false, now)).toBe(false);
    expect(inFreeGrace({ createdAt: '2026-09-06T10:00:00+09:00' }, true, now)).toBe(false);
  });
  it('11/1 0:00（日本時間）からは誰も猶予なし', () => {
    expect(inFreeGrace({ createdAt: '2026-09-06T10:00:00+09:00' }, false, new Date('2026-10-31T23:59:59+09:00'))).toBe(true);
    expect(inFreeGrace({ createdAt: '2026-09-06T10:00:00+09:00' }, false, FREE_PLAN_SUNSET)).toBe(false);
  });
  it('猶予中はこれまでのフリーの上限・新しいお申し込み前は0', () => {
    expect(LEGACY_FREE_PLAN.features.maxAiGenerations).toBe(3);
    expect(LEGACY_FREE_PLAN.features.maxScheduledPosts).toBe(3);
    expect(LEGACY_FREE_PLAN.id).toBe('free');
    expect(PLANS.free.features.maxAiGenerations).toBe(0);
    expect(PLANS.free.features.maxScheduledPosts).toBe(0);
  });
});

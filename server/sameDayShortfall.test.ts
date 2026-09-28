import { describe, it, expect, vi } from 'vitest';

vi.mock('./db', () => ({}));

import { buildSameDaySlots } from './autoPostScheduler';
import { sameDayShortfall, carryOverCount } from '../shared/accountRamp';

// 2026-09-26 川邊様（acc34）：9/25 23:08 にお申し込み→当日補充で2枠しか置けず、
// 置かなかった1枠を「届かなかった」と記録 → 9/26 朝に自動補填で1件足され、自動4件（契約3件）になった。
describe('当日補充の不足の数え方', () => {
  const at2308Jst = new Date('2026-09-25T14:08:00Z');

  it('夜遅くて置けなかった枠は不足に数えない', () => {
    const slots = buildSameDaySlots(3, null, at2308Jst);
    expect(slots.length).toBeLessThan(3);
    const fillTarget = 0 + slots.length;
    const shortfall = sameDayShortfall(fillTarget, slots.length);
    expect(shortfall).toBe(0);
    expect(carryOverCount({ shortfallDate: '2026-09-25', shortfallCount: shortfall }, 0, '2026-09-26')).toBe(0);
  });

  it('置いた枠が作れなかったときは今までどおり不足に数える', () => {
    const slots = buildSameDaySlots(3, null, at2308Jst);
    expect(sameDayShortfall(slots.length, slots.length - 1)).toBe(1);
  });
});

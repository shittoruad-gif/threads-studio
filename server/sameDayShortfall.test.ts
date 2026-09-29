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

// 2026-09-29 川邊様（acc34）：当日補充の枠を、同じアカウントに今日すでにある投稿から60分以上離す。
describe('当日補充の時刻は既存の投稿から離す', () => {
  it('既存の投稿の前後60分には置かない', () => {
    const now = new Date('2026-09-29T01:00:00Z'); // 10:00 JST
    const occupied = [new Date('2026-09-29T06:20:00Z'), new Date('2026-09-29T09:15:00Z')]; // 15:20 / 18:15
    for (let k = 0; k < 20; k++) {
      const slots = buildSameDaySlots(3, [15, 18, 16], now, occupied);
      expect(slots.length).toBe(3);
      for (const s of slots) for (const o of occupied) {
        expect(Math.abs(s.getTime() - o.getTime())).toBeGreaterThanOrEqual(60 * 60_000);
      }
      for (let i = 1; i < slots.length; i++) expect(slots[i].getTime() - slots[i - 1].getTime()).toBeGreaterThanOrEqual(25 * 60_000);
    }
  });

  it('空きが無ければ置かない（詰め込まない）', () => {
    const now = new Date('2026-09-29T14:00:00Z'); // 23:00 JST
    const occupied = [new Date('2026-09-29T14:30:00Z')]; // 23:30
    expect(buildSameDaySlots(2, null, now, occupied)).toEqual([]);
  });
});

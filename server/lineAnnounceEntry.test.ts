import { describe, it, expect } from 'vitest';
import { MENU_ITEMS, announceGuideText, shouldClearPendingInput } from './lineChat';

// 2026-11-19 三上様「公式LINEに告知系のやつがあるかどうか、クライアントがわかりにくい」
describe('公式LINE：お知らせ・告知の入口', () => {
  it('トーク内のメニューに入口があり、LINEの決まり（13個まで・20文字まで）に収まる', () => {
    expect(MENU_ITEMS.some((m) => m.data === 'm=announce' && m.label.includes('告知'))).toBe(true);
    expect(MENU_ITEMS.length).toBeLessThanOrEqual(13);
    for (const m of MENU_ITEMS) expect(Array.from(m.label).length).toBeLessThanOrEqual(20);
  });
  it('案内には、そのまま出す方法と、開催日まで分けて告知する方法の両方がある', () => {
    const t = announceGuideText('https://example.test', true);
    expect(t).toContain('そのまま送ってください');
    expect(t).toContain('https://example.test/events?openExternalBrowser=1');
    expect(t).toContain('14日前・7日前・3日前・前日・当日');
    expect(t).toContain('担当者に聞く');
    // 連携がまだの方には、送れば予約できるとは言わない
    expect(announceGuideText('https://example.test', false)).not.toContain('そのまま送ってください');
  });
  it('入力待ちの途中でほかのボタンを押したら待ちをやめる（次の文を告知として預からない）', () => {
    expect(shouldClearPendingInput('announce_text', { m: 'posts' })).toBe(true);
    expect(shouldClearPendingInput('announce_text', { m: 'announce' })).toBe(false);
  });
});

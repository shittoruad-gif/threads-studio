import { describe, it, expect } from 'vitest';
import { MENU_ITEMS, announceGuideText, wantsAnnounce, shouldClearPendingInput } from './lineChat';

// 2026-11-19 三上様「公式LINEに告知系のやつがあるかどうか、クライアントがわかりにくい」「告知は全員いらない」
describe('公式LINE：お知らせ・告知の入口', () => {
  it('みなさんのメニューにはボタンを足さない（告知は全員には要らない）・「告知」の一言が入口', () => {
    expect(MENU_ITEMS.some((m) => m.data === 'm=announce')).toBe(false);
    for (const ok of ['告知', '告知。', 'お知らせ', '告知したい', '告知を出したい', 'お知らせを出したいです', 'イベント告知', '告知お願いします']) expect(wantsAnnounce(ok), ok).toBe(true);
    // 告知の文そのもの・ご質問・ほかの用件は、この入口では拾わない
    for (const ng of ['12月3日に展示会のお知らせです', '告知はどこからできますか？', 'お知らせが届きません', '今日の投稿', '告知の投稿を止めたい']) expect(wantsAnnounce(ng), ng).toBe(false);
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

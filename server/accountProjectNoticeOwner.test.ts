import { describe, it, expect, vi, beforeEach } from 'vitest';

// 2026-10-06 三上様「早急に改善」：2つ目のアカウントのお店の情報が決まらず投稿が止まる期間を短くする
const pushed: any[] = []; const owner: any[] = [];
vi.mock('./db', () => ({
  getLineUserIdsForUser: async () => ['U1'],
  updateThreadsAccount: async () => undefined,
}));
vi.mock('./lineNotify', () => ({ pushMessages: async (_to: string, m: any[]) => { pushed.push(...m); return true; } }));
vi.mock('./lineChat', () => ({ textWithQuick: (text: string, items: any[]) => ({ text, items }) }));
vi.mock('./_core/notification', () => ({ notifyOwner: async (p: any) => { owner.push(p); return true; } }));

describe('お店の情報が決まっていないアカウントのご案内', () => {
  beforeEach(() => { pushed.length = 0; owner.length = 0; });
  it('お客様には「使う情報を選ぶ」を送り、連携から2日たっていなければ運営には知らせない', async () => {
    const { notifyProjectMissing } = await import('./accountProjectNotice');
    await notifyProjectMissing({ id: 1 }, { id: 33, threadsUsername: 'salon', createdAt: new Date() });
    expect(pushed[0].text).toMatch(/選ぶと、その場で今日の分の投稿づくりを始めます/);
    expect(pushed[0].items[0].data).toBe('c=acct&a=33');
    expect(owner).toHaveLength(0);
  });
  it('連携から2日以上たっても決まっていなければ、運営にも知らせる', async () => {
    const { notifyProjectMissing } = await import('./accountProjectNotice');
    await notifyProjectMissing({ id: 1 }, { id: 33, threadsUsername: 'salon', createdAt: new Date(Date.now() - 3 * 86400000) });
    expect(owner).toHaveLength(1);
    expect(owner[0].content).toMatch(/連携から3日/);
  });
  it('同じアカウントへのご案内は1日1回まで', async () => {
    const { notifyProjectMissing } = await import('./accountProjectNotice');
    const r = await notifyProjectMissing({ id: 1 }, { id: 33, threadsUsername: 'salon', projectMissingNoticeAt: new Date() });
    expect(r).toBe(false);
    expect(pushed).toHaveLength(0);
  });
});

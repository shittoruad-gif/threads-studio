import { describe, it, expect } from 'vitest';
import { pickNextItem, ledgerStatus, itemsFromForm, mergeNgWords, prependStyleSample, buildMaterialNote, type LedgerItem, type ItemUsage } from '../shared/materialLedger';

// 2026-09-30 三上様「フォームで聞くと、同じ情報が何度も投稿されてしまう問題は解決できるか」→ ネタ帳
const DAY = 86400000;
const start = new Date('2026-10-01T00:00:00Z');
const mk = (id: number, kind: string, source = 'form'): LedgerItem => ({ id, kind, content: `ネタ${id}`, source, createdAt: new Date(start.getTime() - (10 - id) * 1000) });

function simulate(items: LedgerItem[], days: number, perDay: number, declineIds: number[] = []) {
  const usage = new Map<number, ItemUsage>();
  const log: Array<{ day: number; id: number | null }> = [];
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < perDay; k++) {
      const now = new Date(start.getTime() + d * DAY + k * 3600000);
      const it = pickNextItem(items, Array.from(usage.values()), now);
      log.push({ day: d, id: it?.id ?? null });
      if (it) {
        const u = usage.get(it.id) ?? { itemId: it.id, lastUsedAt: null, lastDeclinedAt: null };
        u.lastUsedAt = now;
        if (declineIds.includes(it.id)) u.lastDeclinedAt = now;
        usage.set(it.id, u);
      }
    }
  }
  return log;
}

describe('ネタ帳：同じ話を繰り返さない', () => {
  it('話5件を1日3本で60日回しても、同じ話は30日以内に2度使わない', () => {
    const items = [1, 2, 3, 4, 5].map((i) => mk(i, 'episode'));
    const log = simulate(items, 60, 3);
    const lastDay = new Map<number, number>();
    for (const e of log) {
      if (e.id == null) continue;
      const prev = lastDay.get(e.id);
      if (prev != null) expect(e.day - prev).toBeGreaterThanOrEqual(30);
      lastDay.set(e.id, e.day);
    }
    // 最初の5本は5件を1回ずつ使い切る
    expect(log.slice(0, 5).map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
    // 使い切った後はネタ帳からは出さない（お店の情報からの生成に戻る）
    expect(log[5].id).toBeNull();
  });

  it('よくある質問は14日あければまた使う', () => {
    const log = simulate([mk(1, 'faq')], 30, 1);
    expect(log.filter((e) => e.id === 1).map((e) => e.day)).toEqual([0, 14, 28]);
  });

  it('見送られた話は60日使わない', () => {
    const log = simulate([mk(1, 'faq'), mk(2, 'faq')], 40, 1, [1]);
    const used1 = log.filter((e) => e.id === 1).map((e) => e.day);
    expect(used1).toEqual([0]);
  });

  it('まだ使っていない話は、フォームで教えていただいたものを先に使う', () => {
    const items = [mk(1, 'episode', 'counseling'), mk(2, 'episode', 'form')];
    expect(pickNextItem(items, [], start)?.id).toBe(2);
  });

  it('残りの数とネタ切れ', () => {
    const items = [mk(1, 'episode'), mk(2, 'faq')];
    const st = ledgerStatus(items, [{ itemId: 1, lastUsedAt: start, lastDeclinedAt: null }, { itemId: 2, lastUsedAt: start, lastDeclinedAt: null }], new Date(start.getTime() + DAY));
    expect(st.available).toBe(0);
    expect(st.cooling).toBe(2);
    expect(st.nextFreeAt?.getTime()).toBe(start.getTime() + 14 * DAY);
  });
});

describe('フォームの答え', () => {
  it('川邊様の答えは、答えまで入ったネタになる', () => {
    const items = itemsFromForm({ faqs: [{ q: '産後の骨盤を整えるのに、骨盤矯正のほかに大切なものは', a: '骨盤底筋などのインナーマッスル' }] });
    expect(items).toEqual([{ kind: 'faq', content: 'Q：産後の骨盤を整えるのに、骨盤矯正のほかに大切なものは\nA：骨盤底筋などのインナーマッスル' }]);
    expect(buildMaterialNote({ id: 1, ...items[0], createdAt: start })).toContain('答えまで本文に書く');
  });
  it('同じ話を2回送っても1件だけ（句読点・空白の違いは同じとみなす）', () => {
    const items = itemsFromForm({ episodes: ['大会前の高校生。足首のケガ', '大会前の高校生、足首のケガ'] }, [{ content: '別の話です。長さは十分' }]);
    expect(items).toHaveLength(1);
    expect(itemsFromForm({ episodes: ['別の話です。長さは十分'] }, [{ content: '別の話です、長さは十分' }])).toHaveLength(0);
  });
  it('NGワードは足すだけ・お手本は先頭に足す', () => {
    expect(mergeNgWords('学会\n11年', '根本改善、11年')).toBe('学会\n11年\n根本改善');
    expect(prependStyleSample('前のお手本', '新しいお手本')).toBe('新しいお手本\n---\n前のお手本');
    expect(prependStyleSample('新しいお手本\n---\n前', '新しいお手本')).toBe('新しいお手本\n---\n前');
  });
});

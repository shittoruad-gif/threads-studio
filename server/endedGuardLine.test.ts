import { describe, it, expect, vi } from 'vitest';

// 2026-10-03 三上様「解約後は有料機能が全て使えないように徹底」：LINEのボタン・打ち言葉の入口
const state = { ended: true };
const answerQuestion = vi.fn(async () => ({ confident: true, answer: 'お答えです', questionId: 1 }));
vi.mock('./supportBot', () => ({ answerQuestion: (...a: any[]) => (answerQuestion as any)(...a) }));
vi.mock('./db', () => ({
  isEndedCustomer: async () => state.ended,
  getUserByLineUserId: async () => ({ id: 2907, name: '解約ずみの方' }),
  getLineChatState: async () => null,
  clearLineChatState: async () => undefined,
  setLineChatState: async () => undefined,
  getUserById: async () => ({ id: 2907, name: '解約ずみの方' }),
  getSubscriptionByUserId: async () => ({ planId: 'pro', status: 'canceled' }),
  updateSupportQuestion: async () => undefined,
}));

const texts = (msgs: any[]) => msgs.map((m) => String(m?.text ?? '')).join('\n');

describe('ご契約が終わった方のLINE', () => {
  it.each(['a=alt&i=1', 'm=makepin&a=1', 'cr=redo&i=1', 'c=start&mode=store', 'c=proadv', 's=auto&v=on', 'a=ok&i=1', 'a=rw2&i=1'])('%s は動かさず、終了のお知らせを返す', async (data) => {
    state.ended = true;
    const { handlePostback } = await import('./lineChatHandler');
    expect(texts(await handlePostback('U1', data))).toMatch(/ご契約が終了しているため/);
  });

  it('打ち言葉はご質問としてだけ受ける', async () => {
    state.ended = true;
    answerQuestion.mockClear();
    const { handleFreeText } = await import('./lineChatHandler');
    const r = await handleFreeText('U1', 'https://example.com を登録して');
    expect(answerQuestion).toHaveBeenCalledTimes(1);
    expect(texts(r ?? [])).toMatch(/お答えです/);
  });
});

import { describe, it, expect } from 'vitest';
import { isAwaitingStaffAnswer, staffReplyAsksCustomer } from '../shared/awaitingStaffAnswer';

// 2026-09-29 川邊様 #49 → #50：担当者のお願いへのお返事が自動応答に回り、的外れに返していた。
const reply49 = `川邊様

ご連絡ありがとうございます。
この投稿は公開を止め、別の投稿に差し替えました。本日の投稿の本数は変わりません。

もしこの問いかけの形を使いたい場合は、川邊様が患者様にお伝えしている「もう一つ」を、このトークで一言お知らせください。
答えまで入った投稿に作り直してお届けします。

引き続きよろしくお願いいたします。`;

describe('担当者のお願いへのお返事', () => {
  const now = new Date('2026-09-29T01:27:46Z');
  it('#49 の返信の後は担当者へ回す', () => {
    expect(staffReplyAsksCustomer(reply49)).toBe(true);
    expect(isAwaitingStaffAnswer([{ staffReply: reply49, repliedAt: new Date('2026-09-29T01:15:00Z') }], now)).toBe(true);
  });
  it('「何かあればお気軽にお知らせください」だけの返信では回さない', () => {
    const generic = 'ご確認ありがとうございます。設定を直しました。\n何かございましたら、お気軽にこのトークでお知らせください。';
    expect(staffReplyAsksCustomer(generic)).toBe(false);
  });
  it('48時間を過ぎたら回さない', () => {
    expect(isAwaitingStaffAnswer([{ staffReply: reply49, repliedAt: new Date('2026-09-26T01:00:00Z') }], now)).toBe(false);
  });
  it('担当者の返信が無ければ回さない', () => {
    expect(isAwaitingStaffAnswer([{ staffReply: null, repliedAt: null }], now)).toBe(false);
  });
});

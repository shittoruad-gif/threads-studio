import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { retentionOfferFor, retentionDetail, isUpperPlan, RETENTION_MARK } from '../shared/retentionOffer';

// 2026-11-20 三上様「クライアントが解約申請をしたときに、引き止めるための施策を考えて」「進めて」
describe('解約の前の提案：理由に合うものを1つ', () => {
  it('効果を感じられなかった → 担当者が投稿を見直す', () => {
    const o = retentionOfferFor('no_effect', { planId: 'pro' });
    expect(o.key).toBe('review');
    expect(o.body).toContain('費用はかかりません');
  });
  it('料金が高い → 上のプランの方にだけ、下のプランを出す（下のプランの方には相談）', () => {
    expect(retentionOfferFor('price', { planId: 'pro_seminar' }).key).toBe('downgrade');
    expect(retentionOfferFor('price', { planId: 'light' }).key).toBe('consult');
    expect(isUpperPlan('pro_campaign')).toBe(true);
    expect(isUpperPlan('light_seminar')).toBe(false);
  });
  it('使い方が難しい → 確認ありの方にだけ、確認なしの自動投稿を出す', () => {
    expect(retentionOfferFor('hard_to_use', { requireApproval: true }).key).toBe('auto');
    expect(retentionOfferFor('hard_to_use', { requireApproval: false }).key).toBe('consult');
  });
  it('休止したい・その他 → 担当者に相談', () => {
    expect(retentionOfferFor('pause').key).toBe('consult');
    expect(retentionOfferFor('other').key).toBe('consult');
  });
  it('どの提案にも、料金の数字・値引き・絵文字を書かない。「解約しない」と分かるボタンにする', () => {
    for (const r of ['price', 'no_effect', 'hard_to_use', 'pause', 'other'] as const) {
      for (const ctx of [{ planId: 'pro', requireApproval: true }, { planId: 'light', requireApproval: false }]) {
        const o = retentionOfferFor(r, ctx);
        const all = `${o.title}${o.body}${o.actionLabel}`;
        expect(all).not.toMatch(/[0-9０-９]+\s*円|割引|値引|無料で延長/);
        expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(o.actionLabel).toContain('解約しない');
      }
    }
  });
  it('選ばれた提案は、数えられる印をつけて1行にする', () => {
    expect(retentionDetail('review')).toBe(`${RETENTION_MARK}担当者が投稿を見直す`);
    expect(retentionDetail('consult', ' 冬は休みたい ')).toBe(`${RETENTION_MARK}担当者に相談する／冬は休みたい`);
  });
});

describe('解約をしにくくしない', () => {
  const src = readFileSync(new URL('../client/src/pages/Dashboard.tsx', import.meta.url), 'utf8');
  it('提案の画面に、1回押すだけで解約できるボタンがある', () => {
    expect(src).toContain('提案は不要です。解約する');
    const i = src.indexOf('提案は不要です。解約する');
    const before = src.slice(i - 700, i);
    expect(before).toContain('cancelSubscription.mutate()');
  });
});

import { describe, it, expect } from 'vitest';
import { isNaturalStyleUser, naturalStyleAddendum, findCliches } from '../shared/naturalStyle';
import { applyLengthRange } from '../shared/sampleLength';

describe('自然な書き方モード', () => {
  it('対象は香取様（3500）だけ', () => {
    expect(isNaturalStyleUser(3500)).toBe(true);
    expect(isNaturalStyleUser(78)).toBe(false);
    expect(isNaturalStyleUser(null)).toBe(false);
  });
  it('数字始まり・絵文字1〜3個・50〜100字の決まりを含まない', () => {
    const a = naturalStyleAddendum({ allowEmoji: true });
    expect(a).not.toMatch(/1行目に「数字」を置く/);
    expect(a).not.toMatch(/絵文字を1〜3個/);
    expect(a).not.toMatch(/50〜100/);
    expect(a).toMatch(/1行目を数字で始めない/);
    expect(applyLengthRange(a, { avg: 141, lo: 124, hi: 159, n: 7 })).toBe(a);
  });
  it('絵文字を使わない方には絵文字なしと書く', () => {
    expect(naturalStyleAddendum({ allowEmoji: false })).toMatch(/絵文字は使わない/);
  });
  it('決まり文句を見つける', () => {
    expect(findCliches('根本から整えて、その場しのぎにしない')).toEqual(['根本から', 'その場しのぎ']);
    expect(findCliches('お話を伺います')).toEqual([]);
  });
});

describe('最後の問いかけを外す', () => {
  it('最後の「？」の文だけ外す', async () => {
    const { dropTrailingQuestion } = await import('../shared/naturalStyle');
    const t = '事故に遭った直後は平気だと思われがちです。\n\nでも、数日経ってから首や腰に重さが出てくることもあります。\n\nお体の違和感は、何日目くらいから気になり始めましたか？';
    expect(dropTrailingQuestion(t)).toBe('事故に遭った直後は平気だと思われがちです。\n\nでも、数日経ってから首や腰に重さが出てくることもあります。');
  });
  it('外すと短すぎるなら外さない', async () => {
    const { dropTrailingQuestion } = await import('../shared/naturalStyle');
    expect(dropTrailingQuestion('腰が痛いです。どうですか？')).toBeNull();
  });
});

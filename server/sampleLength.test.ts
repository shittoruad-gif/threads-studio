import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sampleLengthRange, applyLengthRange, budgetForRange, visibleLength } from '../shared/sampleLength';
import { generateThreadsPrompt } from '../shared/threadsPrompts';
import { POST_LENGTHS } from '../shared/postLength';

const mk = (n: number, len: number) => Array.from({ length: n }, () => 'あ'.repeat(len)).join('\n---\n');

describe('お手本の平均字数から長さを決める', () => {
  it('3本未満なら使わない', () => {
    expect(sampleLengthRange(mk(2, 140))).toBeNull();
    expect(sampleLengthRange(null)).toBeNull();
  });
  it('香取様と同じ平均141字なら 124〜159字', () => {
    const lens = [139, 138, 129, 159, 139, 107, 173];
    const r = sampleLengthRange(lens.map((l) => 'あ'.repeat(l)).join('\n---\n'))!;
    expect(r.avg).toBe(141);
    expect(r.lo).toBe(124);
    expect(r.hi).toBe(159);
  });
  it('改行・空白は数えない', () => {
    expect(visibleLength('あい\nう え\n\nお')).toBe(5);
  });
  it('下限50字・上限300字で止める／極端に長い1本は外す', () => {
    expect(sampleLengthRange(mk(3, 30))!.lo).toBe(50);
    expect(sampleLengthRange(mk(3, 400))!.hi).toBe(300);
    const withOutlier = [mk(3, 100), 'い'.repeat(900)].join('\n---\n');
    expect(sampleLengthRange(withOutlier)!.avg).toBe(100);
  });
  it('機械カットの上限は既定より小さくしない・480を超えない', () => {
    expect(budgetForRange(null, 140)).toBe(140);
    expect(budgetForRange({ avg: 60, lo: 53, hi: 68, n: 3 }, 140)).toBe(140);
    expect(budgetForRange({ avg: 141, lo: 124, hi: 159, n: 7 }, 140)).toBe(219);
    expect(budgetForRange({ avg: 300, lo: 264, hi: 300, n: 3 }, 140)).toBe(360);
  });
});

describe('プロンプトの一律ルールを置き換える', () => {
  const r = { avg: 141, lo: 124, hi: 159, n: 7 };
  it('範囲が無ければ何も変えない', () => {
    expect(applyLengthRange('本文は50〜100字。', null)).toBe('本文は50〜100字。');
  });
  it('自動投稿の最終指示から「50〜100」「実測」の一般論が消える', () => {
    const src = readFileSync(new URL('./autoPostScheduler.ts', import.meta.url), 'utf8');
    const add = src.match(/const AUTO_POST_STYLE_ADDENDUM = `([\s\S]*?)`;/)![1];
    const out = applyLengthRange(add, r);
    expect(out).not.toMatch(/50〜100/);
    expect(out).not.toMatch(/100字を超えると/);
    expect(out).toMatch(/124〜159文字/);
    expect(out).toMatch(/平均141字/);
  });
  it('書き直しの指示の「50〜100文字」も置き換わる', () => {
    const src = readFileSync(new URL('./autoPostScheduler.ts', import.meta.url), 'utf8');
    const line = src.split('\n').find((l) => l.includes('合計 **50〜100文字** に収める'))!;
    expect(applyLengthRange(line, r)).toMatch(/124〜159文字/);
  });
  it('生成プロンプト本体（threadsPrompts）からも 50〜100 と実測の一般論が消える', () => {
    const p = generateThreadsPrompt({
      storeName: 'テスト接骨院', businessType: '接骨院', area: '土浦市', target: '学生', mainProblem: '腰痛',
      strength: 'エコー', proof: '', treeCount: 0,
    } as any);
    const out = applyLengthRange(p, r);
    expect(out).not.toMatch(/50〜100/);
    expect(out).not.toMatch(/50字までが最も見られ/);
  });
  it('短めの設定文の言い回しが変わったら気づけるように', () => {
    expect(POST_LENGTHS.short.guide).toMatch(/50〜100字/);
  });
});

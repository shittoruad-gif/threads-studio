import { describe, it, expect } from "vitest";
import {
  INDUSTRY_INSIGHTS, industryInsightFor, buildIndustryStyleSection,
} from "../shared/industryStyleInsights";
import { BANNED_TIC_PHRASES } from "../shared/jpQualityGuard";

describe("業種別インサイトの整合性", () => {
  it("全エントリが match / win / avoid を持つ", () => {
    expect(INDUSTRY_INSIGHTS.length).toBeGreaterThan(0);
    for (const ins of INDUSTRY_INSIGHTS) {
      expect(ins.match.length, `${ins.id} の match が空`).toBeGreaterThan(0);
      expect(ins.win.length, `${ins.id} の win が空`).toBeGreaterThan(0);
      expect(ins.avoid.length, `${ins.id} の avoid が空`).toBeGreaterThan(0);
    }
  });

  it("win/avoid の各行が指示として短い（120字以内・箇条書き前提）", () => {
    for (const ins of INDUSTRY_INSIGHTS) {
      for (const line of [...ins.win, ...ins.avoid]) {
        expect(line.length, `${ins.id}: ${line.slice(0, 30)}…`).toBeLessThanOrEqual(120);
      }
    }
  });

  it("禁止フレーズ（AI口癖）を指示文自体が含まない", () => {
    for (const ins of INDUSTRY_INSIGHTS) {
      const all = [...ins.win, ...ins.avoid].join('');
      for (const banned of BANNED_TIC_PHRASES) {
        expect(all.includes(banned), `${ins.id} に「${banned}」`).toBe(false);
      }
    }
  });

  it("薬機法・景表法に触れる断定を促す語を含まない", () => {
    for (const ins of INDUSTRY_INSIGHTS) {
      for (const w of ['治る', '治せる', '必ず痩せ', '絶対に効', 'No.1']) {
        expect(ins.win.join('').includes(w), `${ins.id} win に「${w}」`).toBe(false);
      }
    }
  });
});

describe("businessType とのマッチング", () => {
  const cases: Array<[string, string | null]> = [
    ['パン屋・ベーカリー経営', 'bakery'],
    ['カフェ', 'cafe'],
    ['ネイルサロン', 'nail'],
    ['フェイシャルエステサロン', 'esthe'],
    ['パーソナルジム・トレーニング指導', 'gym'],
    ['ピアノ教室', 'school'],
    ['ハンドメイドアクセサリー販売', 'handmade'],
    ['不動産仲介', 'fudosan'],
    ['税理士事務所', 'zeirishi'],
    ['整体院・鍼灸', 'chiryoin'],
    ['まったく該当しない宇宙開発業', null],
  ];
  it.each(cases)('%s → %s', (businessType, expected) => {
    const got = industryInsightFor(businessType);
    if (expected === null) expect(got).toBeNull();
    else expect(got?.id).toBe(expected);
  });

  it("該当業種が無ければセクションを出さない（空文字）", () => {
    expect(buildIndustryStyleSection('宇宙開発業')).toBe('');
    expect(buildIndustryStyleSection(null)).toBe('');
    expect(buildIndustryStyleSection('')).toBe('');
  });

  it("該当業種にはセクションが組み上がる", () => {
    const sec = buildIndustryStyleSection('パン屋');
    expect(sec).toContain('勝ち筋');
    expect(sec).toContain('効く書き方:');
    expect(sec).toContain('避ける書き方:');
  });
});

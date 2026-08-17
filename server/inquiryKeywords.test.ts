import { describe, it, expect } from "vitest";
import {
  INQUIRY_KEYWORDS,
  ACTIVE_INQUIRY_KEYWORDS,
  LEGACY_INQUIRY_KEYWORDS,
  KEYWORD_SWITCH_POST_ID,
  inquiryKeywordForPost,
} from "../shared/inquiryKeywords";

/**
 * 合言葉は「どの店舗でも必ず当てはまる言葉」でなければならない。
 * 施術メニュー名・症状名が混ざると、そのメニューを扱っていない店舗
 * （例：鍼灸院に「ピラティス」）で誤案内になる。
 */
const MENU_OR_SYMPTOM_WORDS = [
  'ピラティス', 'ヨガ', '整体', '鍼', '灸', 'マッサージ', 'リフレ', '美容鍼',
  '猫背', '姿勢', '骨盤', '体験', 'レッスン', 'コース', 'グループ', 'パーソナル',
];

describe("流入計測の合言葉", () => {
  it("現行の合言葉にメニュー名・症状名を含まない", () => {
    for (const kw of ACTIVE_INQUIRY_KEYWORDS) {
      expect(MENU_OR_SYMPTOM_WORDS).not.toContain(kw);
    }
  });

  it("切替後の投稿には現行の合言葉だけを案内する", () => {
    for (let id = KEYWORD_SWITCH_POST_ID; id < KEYWORD_SWITCH_POST_ID + 50; id++) {
      expect(ACTIVE_INQUIRY_KEYWORDS as readonly string[]).toContain(inquiryKeywordForPost(id));
    }
  });

  it("切替前の投稿は当時の合言葉のまま（過去の集計を壊さない）", () => {
    // 実際に「ピラティス」で案内してしまっていた滝本さんの投稿
    expect(inquiryKeywordForPost(511)).toBe('ピラティス');
    expect(inquiryKeywordForPost(516)).toBe('ピラティス');
    for (let id = 1; id < KEYWORD_SWITCH_POST_ID; id++) {
      expect(LEGACY_INQUIRY_KEYWORDS as readonly string[]).toContain(inquiryKeywordForPost(id));
    }
  });

  it("Keiroへ渡す検索語は新旧すべてを含み、重複しない", () => {
    for (const kw of [...ACTIVE_INQUIRY_KEYWORDS, ...LEGACY_INQUIRY_KEYWORDS]) {
      expect(INQUIRY_KEYWORDS).toContain(kw);
    }
    expect(new Set(INQUIRY_KEYWORDS).size).toBe(INQUIRY_KEYWORDS.length);
  });

  it("同じ日に作られる連番の投稿は別の合言葉になる（投稿別に判別できる）", () => {
    const a = inquiryKeywordForPost(600);
    const b = inquiryKeywordForPost(601);
    const c = inquiryKeywordForPost(602);
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

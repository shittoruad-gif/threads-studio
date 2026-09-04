import { describe, it, expect } from "vitest";
import { COUNSELING_QUESTIONS } from "../shared/counseling";
import { applyIndustryOverrides, detectIndustryProfile } from "../shared/industryProfiles";

const q = (qs: any[], id: string) => qs.find((x) => x.id === id)!;
const all = (qs: any[]) => JSON.stringify(qs);

describe("業種の判定", () => {
  it("代表的な業種を正しく振り分ける", () => {
    const cases: [string, string][] = [
      ["産後ケア専門の整体院", "bodywork"],
      ["整骨院", "bodywork"],
      ["まつげサロン", "beauty"],
      ["美容室", "beauty"],
      ["マシンピラティススタジオ", "fitness"],
      ["子ども向けのピアノ教室", "school"],
      ["個別指導塾", "school"],
      ["駅前の小さなカフェ", "food"],
      ["歯科医院", "clinic"],
      ["税理士事務所", "pro"],
      ["ハウスクリーニング", "home"],
      ["ネットショップ（雑貨）", "retail"],
    ];
    for (const [input, key] of cases) {
      expect(detectIndustryProfile(input).key, input).toBe(key);
    }
  });

  it("分からない業種は中立になる（治療院を既定にしない）", () => {
    expect(detectIndustryProfile("わたしの仕事").key).toBe("general");
    expect(detectIndustryProfile("").key).toBe("general");
    expect(detectIndustryProfile(null).key).toBe("general");
  });
});

describe("業種に合わせた出し分け", () => {
  it("治療院はこれまでの文面のまま変わらない", () => {
    expect(applyIndustryOverrides(COUNSELING_QUESTIONS, "整体院")).toEqual(COUNSELING_QUESTIONS);
  });

  it("カフェには治療院の候補も言い回しも出さない", () => {
    const qs = applyIndustryOverrides(COUNSELING_QUESTIONS, "駅前のカフェ");
    const text = all(qs);
    for (const ng of ["骨盤矯正", "痛い施術ですか？", "肩こり", "腰痛", "患者さん", "国家資格者による施術"]) {
      expect(text, ng).not.toContain(ng);
    }
    expect(q(qs, "faqRaw").suggestions).toContain("駐車場はありますか？");
  });

  it("教室では「生徒さん」「レッスン」の言い方になる", () => {
    const qs = applyIndustryOverrides(COUNSELING_QUESTIONS, "ピアノ教室");
    expect(q(qs, "realEpisodesRaw").prompt).toContain("生徒さん");
    expect(q(qs, "menuRaw").prompt).toContain("レッスン");
    expect(all(qs)).not.toContain("施術");
  });

  it("士業では「ご相談」「事務所」の言い方になる", () => {
    const qs = applyIndustryOverrides(COUNSELING_QUESTIONS, "税理士事務所");
    expect(all(qs)).not.toContain("施術");
    expect(all(qs)).not.toContain("患者さん");
    expect(q(qs, "faqRaw").suggestions).toContain("オンラインでも対応できますか？");
  });

  it("どの業種でも質問の数・並び・保存先IDは変わらない", () => {
    for (const t of ["カフェ", "ピアノ教室", "税理士事務所", "まつげサロン", "なにか別の仕事", "整体院"]) {
      const qs = applyIndustryOverrides(COUNSELING_QUESTIONS, t);
      expect(qs.map((x) => x.id), t).toEqual(COUNSELING_QUESTIONS.map((x) => x.id));
      expect(qs.map((x) => x.required), t).toEqual(COUNSELING_QUESTIONS.map((x) => x.required));
      expect(qs.map((x) => x.ui), t).toEqual(COUNSELING_QUESTIONS.map((x) => x.ui));
    }
  });

  it("どの業種でも、候補と例文が空にならない", () => {
    for (const t of ["カフェ", "ピアノ教室", "税理士事務所", "ハウスクリーニング", "なにか別の仕事"]) {
      const qs = applyIndustryOverrides(COUNSELING_QUESTIONS, t);
      for (const base of COUNSELING_QUESTIONS) {
        const got = q(qs, base.id as string);
        if (base.suggestions?.length) expect(got.suggestions?.length, `${t}/${base.id}`).toBeGreaterThan(0);
        if (base.examples?.length) expect(got.examples?.length, `${t}/${base.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("1問目の業種候補は特定業種に偏らない", () => {
    const s = q(COUNSELING_QUESTIONS, "businessTypeRaw").suggestions!;
    expect(s).toContain("飲食店・カフェ");
    expect(s).toContain("士業・コンサル");
    expect(s).toContain("教室・スクール");
  });
});

// ── 生成プロンプトに入る「伸びる型」も業種で選ぶ（2026-09-04）──
import { buildWinningPatternSection, WINNING_PATTERNS } from "../shared/winningPatterns";

describe("伸びる型の出し分け", () => {
  it("カフェには飲食の型だけが入り、治療院の型は入らない", () => {
    const s = buildWinningPatternSection("駅前のカフェ");
    expect(s).toContain("飲食店・カフェ");
    expect(s).not.toContain("整体");
    expect(s).not.toContain("地域名+症状名");
  });

  it("整体院にはこれまでどおり治療院の型が入る", () => {
    const s = buildWinningPatternSection("産後ケア専門の整体院");
    expect(s).toContain("整体院・接骨院・整骨院");
    expect(s).toContain("地域名+症状名");
    expect(s).not.toContain("飲食店・カフェ");
  });

  it("業種が分からないときは何も入れない（治療院の型を既定にしない）", () => {
    expect(buildWinningPatternSection("なにか別の仕事")).toBe("");
    expect(buildWinningPatternSection("")).toBe("");
    expect(buildWinningPatternSection(null)).toBe("");
  });

  it("10業種すべてが1つずつ引ける", () => {
    const cases: [string, string][] = [
      ["整体院", "bodywork"], ["鍼灸院", "acupuncture"], ["まつげサロン", "beauty"],
      ["ピラティススタジオ", "fitness"], ["カフェ", "food"], ["歯科医院", "clinic"],
      ["ピアノ教室", "school"], ["不動産仲介", "realestate"], ["税理士事務所", "pro"],
      ["旅行の発信", "travel"],
    ];
    for (const [input, key] of cases) {
      const hit = WINNING_PATTERNS.find((p) => p.match.some((m) => input.includes(m)));
      expect(hit?.key, input).toBe(key);
    }
  });
});

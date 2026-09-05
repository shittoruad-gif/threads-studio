import { describe, it, expect } from "vitest";
import { detectIndustryMismatch, detectProjectIndustryMismatch } from "../shared/industryMismatch";

/**
 * 業種と「はじめの設定」の答えのズレ検知。
 * 2026-09-06 に呉服店のお客様が、整体向けの選択肢をそのまま押して登録していた
 * （三上様指示：こうしたズレは運営に通知する）。
 */
describe("業種と答えのズレ", () => {
  it("呉服店なのに整体の選択肢が入っていたら、ズレと判定する（実際に起きた例）", () => {
    const r = detectIndustryMismatch("呉服店", {
      targetRaw: "美容・見た目を気にする女性",
      mainProblemRaw: "冷え・むくみ",
      menuRaw: "自律神経・睡眠ケア",
    });
    expect(r.mismatch).toBe(true);
    expect(r.hits.map((h) => h.term)).toEqual(expect.arrayContaining(["冷え・むくみ", "自律神経・睡眠ケア"]));
    expect(r.summary).toContain("呉服店");
    expect(r.summary).toContain("治療院");
  });

  it("呉服店が呉服店らしく答えていれば、ズレではない（同じお客様の2回目の登録）", () => {
    const r = detectIndustryMismatch("呉服小売店", {
      targetRaw: "20〜70代の女性\n\nお茶をされている方\nお琴をされている方\n踊りをされている方",
      mainProblemRaw: "敷居が高いと思われている？",
      menuRaw: "本物の正絹を扱っている。お茶のお稽古、お茶会、お琴のお稽古の時にお召しになる着物を取り揃えている。",
      realProofsRaw: "今年で創業130年を迎える。",
    });
    expect(r.mismatch).toBe(false);
    expect(r.hits).toEqual([]);
  });

  it("整体院が整体の選択肢を使うのは当然なので、ズレではない", () => {
    const r = detectIndustryMismatch("整体院", {
      targetRaw: "デスクワークの会社員",
      mainProblemRaw: "慢性的な肩こり、繰り返す腰痛",
      menuRaw: "骨盤矯正、猫背・姿勢改善",
      faqRaw: "痛い施術ですか？",
    });
    expect(r.mismatch).toBe(false);
  });

  it("カフェがカフェの選択肢を使うのは、ズレではない", () => {
    const r = detectIndustryMismatch("駅前のカフェ", {
      targetRaw: "近隣で働く会社員",
      mainProblemRaw: "一人で入りづらい",
      benefitsDailyRaw: "仕事の合間にほっとできる",
    });
    expect(r.mismatch).toBe(false);
  });

  it("カフェなのに肩こり・施術の話が複数の答えに出たら、ズレと判定する", () => {
    const r = detectIndustryMismatch("カフェ", {
      mainProblemRaw: "肩こりがつらい方が多い",
      strengthRaw: "国家資格者による施術",
    });
    expect(r.mismatch).toBe(true);
  });

  it("ジムやエステが体の話をするのは自然なので、言葉だけではズレにしない", () => {
    expect(detectIndustryMismatch("パーソナルジム", { mainProblemRaw: "腰痛があって運動が怖い" }).mismatch).toBe(false);
    expect(detectIndustryMismatch("エステサロン", { mainProblemRaw: "むくみが気になる", benefitsDailyRaw: "施術のあと軽くなる" }).mismatch).toBe(false);
  });

  it("業種が分からないときは、別の業種の選択肢が2つ以上あるときだけズレにする", () => {
    expect(detectIndustryMismatch("なにか別の仕事", { mainProblemRaw: "冷え・むくみ" }).mismatch).toBe(false);
    expect(detectIndustryMismatch("なにか別の仕事", { mainProblemRaw: "冷え・むくみ", menuRaw: "自律神経・睡眠ケア" }).mismatch).toBe(true);
  });

  it("空の答えは何も判定しない", () => {
    expect(detectIndustryMismatch("呉服店", {}).mismatch).toBe(false);
    expect(detectIndustryMismatch("", { targetRaw: "冷え・むくみ" }).mismatch).toBe(false);
  });

  it("お店の情報の行からも判定できる（counselingResult が無ければ列の値で）", () => {
    const r = detectProjectIndustryMismatch({
      businessType: "呉服店",
      target: "美容・見た目を気にする女性",
      mainProblem: "冷え・むくみ",
      counselingResult: null,
    });
    expect(r.mismatch).toBe(true);
    const ok = detectProjectIndustryMismatch({
      businessType: "呉服店",
      counselingResult: JSON.stringify({ rawAnswers: { businessTypeRaw: "呉服店", targetRaw: "お稽古の方", mainProblemRaw: "敷居が高い" } }),
    });
    expect(ok.mismatch).toBe(false);
  });
});

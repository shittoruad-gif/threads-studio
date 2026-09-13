import { describe, it, expect } from "vitest";
import { COUNSELING_QUESTIONS, QUICK_QUESTION_IDS, quickQuestions } from "../shared/counseling";

/**
 * 「まず5つ」（ホームページのURL1つ＋4問）は、公式LINEで新しいお客様が最初に通る道。
 * ここの文が分かりにくいと、そのまま離脱になる（[[feedback_counseling_questions_plain_language]]）。
 */
describe("はじめの設定「まず5つ」の質問文", () => {
  const quick = quickQuestions(COUNSELING_QUESTIONS as any) as any[];

  it("4問そろっている", () => {
    expect(quick.map((q) => q.id)).toEqual([...QUICK_QUESTION_IDS]);
  });

  it("まだ聞いていない質問を指す「その〇〇」を使わない", () => {
    // お客さん像（targetRaw）は「まず5つ」では聞かないので、
    // 「そのお客さん」と書くと、何を指すのか分からない（2026-09-14 夜間整備の通し確認で実際に出た）。
    const asked = new Set(QUICK_QUESTION_IDS);
    if (!asked.has("targetRaw")) {
      for (const q of quick) {
        expect(String(q.prompt)).not.toContain("そのお客さん");
      }
    }
  });

  it("お悩みの質問は、お客さん像を聞いていなくても意味が通る", () => {
    const p = quick.find((q) => q.id === "mainProblemRaw");
    expect(p).toBeTruthy();
    expect(String(p.prompt)).toContain("お客さん");
    expect(String(p.prompt)).toContain("困って");
  });

  it("内部用語を混ぜない（お客様がそのまま読む文）", () => {
    for (const q of quick) {
      const text = `${q.prompt}\n${q.helper ?? ""}`;
      for (const ng of ["ペルソナ", "USP", "CTA", "コンバージョン", "LTV", "リード", "訴求"]) {
        expect(text).not.toContain(ng);
      }
    }
  });
});

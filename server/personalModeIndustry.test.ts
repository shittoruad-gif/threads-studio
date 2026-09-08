import { describe, it, expect } from "vitest";
import { COUNSELING_QUESTIONS } from "../shared/counseling";
import { applyIndustryOverrides } from "../shared/industryProfiles";
import { applyPersonalOverrides } from "../shared/personalBrand";
import { detectIndustryMismatch } from "../shared/industryMismatch";

/**
 * 2026-09-08 佐々木様（コンサルタント・個人モード）に治療院の既定チップ
 * 「40〜60代の男性」「繰り返す腰痛」「夜遅くまで営業」が出て、そのまま登録された。
 * 個人モードでも業種の差し替えを先に通すこと（server/lineChatHandler.ts questionsFor と同じ合成）。
 */
const BODYWORK_CHIPS = ["40〜60代の男性", "繰り返す腰痛", "夜遅くまで営業", "慢性的な肩こり", "産後の骨盤の歪み"];
const chips = (qs: any[], id: string): string[] => (qs.find((q) => q.id === id)?.suggestions ?? []) as string[];

describe("個人モードでも業種で選択肢が切り替わる", () => {
  it("コンサルタント＋個人モードに治療院の既定チップが出ない", () => {
    const qs = applyPersonalOverrides(applyIndustryOverrides(COUNSELING_QUESTIONS, "コンサルタント"));
    for (const id of ["targetRaw", "mainProblemRaw", "strengthRaw"]) {
      const c = chips(qs, id);
      for (const bad of BODYWORK_CHIPS) expect(c, `${id} に「${bad}」`).not.toContain(bad);
    }
  });

  it("以前の合成（業種を通さない個人モード）だと治療院の既定チップが出ていた（再発の証拠）", () => {
    const qs = applyPersonalOverrides(COUNSELING_QUESTIONS);
    const all = [...chips(qs, "targetRaw"), ...chips(qs, "mainProblemRaw"), ...chips(qs, "strengthRaw")];
    expect(BODYWORK_CHIPS.some((b) => all.includes(b))).toBe(true);
  });

  it("整体院なら治療院のチップのまま", () => {
    const qs = applyPersonalOverrides(applyIndustryOverrides(COUNSELING_QUESTIONS, "整体院"));
    expect(chips(qs, "mainProblemRaw").some((c) => /肩こり|腰痛/.test(c))).toBe(true);
  });
});

describe("前回の答えが業種と合わないときの判定（これでOKを出さないために使う）", () => {
  it("コンサルタントの『お悩み』に『繰り返す腰痛』はズレ", () => {
    const r = detectIndustryMismatch("コンサルタント", { mainProblemRaw: "繰り返す腰痛" } as any);
    expect(r.mismatch).toBe(true);
    expect(r.hits.some((h) => h.field === "mainProblemRaw")).toBe(true);
  });
  it("コンサルタントの『お客さん像』が『腰痛・肩こり』（治療院の言葉だけ）でもズレ", () => {
    const r = detectIndustryMismatch("コンサルタント", { targetRaw: "腰痛・肩こり" } as any);
    expect(r.mismatch).toBe(true);
  });
  it("整体院の『お客さん像』に『腰痛・肩こり』はズレでない（治療院の言葉が正しい業種）", () => {
    expect(detectIndustryMismatch("整体院", { targetRaw: "腰痛・肩こり" } as any).mismatch).toBe(false);
  });
  it("コンサルタントの『お客さん像』に『開業3年目の院長』はズレでない", () => {
    const r = detectIndustryMismatch("コンサルタント", { targetRaw: "集客に悩む小さな会社の経営者" } as any);
    expect(r.mismatch).toBe(false);
  });
});

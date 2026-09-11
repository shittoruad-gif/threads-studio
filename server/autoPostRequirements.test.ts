import { describe, it, expect } from "vitest";
import { missingAutoPostFields, canAutoPost, AUTO_POST_FIELDS } from "../shared/autoPostRequirements";

/** 「まず5問」を終えた直後のお店の情報（ローカルQAで実際に作られた形） */
const afterQuickSetup = {
  id: "line_mtx5yd6qcixu2k",
  businessType: "整体院",
  area: "岡山県倉敷市玉島",
  storeName: "QAテスト整体院",
  mainProblem: "デスクワークで肩こりや腰痛にお困りの30〜50代の方",
  target: null,
  strength: "",
};

describe("自動投稿に要る項目（2026-09-12）", () => {
  it("「まず5問」だけでは、お客さん像と強みが空のまま", () => {
    const missing = missingAutoPostFields(afterQuickSetup);
    expect(missing.map((m) => m.column)).toEqual(["target", "strength"]);
    expect(canAutoPost(afterQuickSetup)).toBe(false);
  });

  it("お客様にお見せする呼び名が入っている（案内で名指しするため）", () => {
    expect(missingAutoPostFields(afterQuickSetup).map((m) => m.label)).toEqual(["お客さん像", "お店の強み"]);
  });

  it("その1問から聞けるように、質問IDが付いている", () => {
    expect(missingAutoPostFields(afterQuickSetup)[0].id).toBe("targetRaw");
  });

  it("全部そろえば投稿を作れる", () => {
    const full = { ...afterQuickSetup, target: "デスクワークの30〜50代", strength: "国家資格者が担当します" };
    expect(missingAutoPostFields(full)).toEqual([]);
    expect(canAutoPost(full)).toBe(true);
  });

  it("空白だけの答えは、埋まっていない扱い", () => {
    expect(canAutoPost({ businessType: "整体院", area: " ", mainProblem: "肩こり", target: "　", strength: "丁寧" })).toBe(false);
  });

  it("何も無いお店は、5項目すべてが足りない", () => {
    expect(missingAutoPostFields({})).toHaveLength(AUTO_POST_FIELDS.length);
    expect(missingAutoPostFields(null)).toHaveLength(AUTO_POST_FIELDS.length);
  });
});

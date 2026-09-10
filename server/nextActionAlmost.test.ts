import { describe, it, expect } from "vitest";
import { isAlmostUsableProject, missingRequired } from "./nextAction";

/**
 * 2026-09-11：「はじめの設定」は「まず5問」（URL＋業種・地域・店名・お悩み）で終わるのに、
 * 自動投稿の対象条件はお客さん像（target）と強み（strength）まで求めている。
 * そのため5問を終えた方に「まだ『お店の情報』が登録されていない」＋「はじめの設定」を案内していた。
 *
 * 実測（9/11）：大木慎也様・juria様（どちらもプロ・9/9ご登録）は強みだけが空で、投稿は1本も作られていない。
 */
describe("5問だけ終わっている方の「次にやること」", () => {
  const fivePlusTarget = {
    id: "line_mtu13tvtq7cpj9",
    businessType: "整体院",
    area: "岡山市北区京橋町",
    storeName: "大木整体院",
    mainProblem: "長引く腰の痛み",
    target: "デスクワークの30〜50代",
    strength: "",
  };

  it("強みだけ空いている方は「登録されていない」ではなく「あと1問」に振り分ける", () => {
    expect(isAlmostUsableProject(fivePlusTarget)).toBe(true);
    expect(missingRequired(fivePlusTarget)).toEqual([{ label: "強み", questionId: "strengthRaw" }]);
  });

  it("5問ぶんだけの方（お客さん像も強みも空）は2問として案内する", () => {
    const five = { ...fivePlusTarget, target: "" };
    expect(isAlmostUsableProject(five)).toBe(true);
    expect(missingRequired(five).map((m) => m.label)).toEqual(["お客さん像", "強み"]);
  });

  it("全部そろっている方は対象外（これまでどおり次の工程へ進む）", () => {
    expect(isAlmostUsableProject({ ...fivePlusTarget, strength: "国家資格をもつ院長が担当" })).toBe(false);
  });

  it("何も登録していない方は対象外（「はじめの設定」の案内のまま）", () => {
    expect(isAlmostUsableProject({ id: "x", businessType: "", area: "", mainProblem: "" })).toBe(false);
    expect(isAlmostUsableProject(null)).toBe(false);
  });

  it("デモのお店の情報は対象にしない", () => {
    expect(isAlmostUsableProject({ ...fivePlusTarget, id: "demo_shibuya" })).toBe(false);
  });
});

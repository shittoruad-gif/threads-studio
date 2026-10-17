import { describe, expect, it } from "vitest";
import { dupRetryHint } from "../shared/dupRetryHint";
import { LEARNING_TRIALS } from "../shared/learningAccounts";

// 2026-10-09 夜間整備：10/9朝 acc10 の学習の枠で、3回目に1回目の言い回しへ戻って枠ごと見送りになった
describe("同じ言い回しで作り直すときの指示", () => {
  it("前の回で落ちた言い回しも残して渡す", () => {
    const h1 = dupRetryHint(null, "初心者からアスリートまで");
    const h2 = dupRetryHint(h1, "体が硬いからピラティスは無理って");
    expect(h2).toContain("「初心者からアスリートまで」");
    expect(h2).toContain("「体が硬いからピラティスは無理って」");
  });
  it("同じ言い回しは重ねない・ほかの理由の指示は引き継がない", () => {
    const h1 = dupRetryHint(null, "仕事帰りにもどうぞ");
    expect(dupRetryHint(h1, "仕事帰りにもどうぞ").match(/仕事帰りにもどうぞ/g)!.length).toBe(1);
    const other = "- 自然さの点検で落ちた：〜";
    expect(dupRetryHint(other, "あいう")).not.toContain("自然さ");
  });
  it("言い回しの中のかぎかっこで前の回の言い回しを読み違えない", () => {
    const h1 = dupRetryHint(null, "く触れる」が基本です");
    const h2 = dupRetryHint(h1, "滑川市にある当院");
    expect(h2).toContain("「く触れるが基本です」");
    expect(h2).toContain("「滑川市にある当院」");
  });
});

describe("学習の枠「箇条書き3つ」", () => {
  it("宣伝の見出し・締めを避ける指示が入っている（10/9朝「選ばれる理由3つ」で2回とも2/5）", () => {
    const n = LEARNING_TRIALS.find((t) => t.key === "list3")!.note;
    expect(n).toContain("選ばれる理由3つ");
    expect(n).toContain("宣伝にせず");
  });
});

// 2026-10-17 夜間整備：acc36 で「店舗オーナーさんからよく聞く」を少しずつ変えて23回作り直し・6枠見送り
describe("同じ言い回しが流れの型に当たるとき", () => {
  it("型ごと避ける指示を添え、次の回でも言い回しを読み違えない", () => {
    const h1 = dupRetryHint(null, "の店舗オーナーさんからよく聞く");
    expect(h1).toContain("誰から聞いたかの前置き");
    const h2 = dupRetryHint(h1, "LINE登録の流入経路");
    expect(h2.split("\n")[0]).toContain("「の店舗オーナーさんからよく聞く」");
    expect(h2.split("\n")[0]).toContain("「LINE登録の流入経路」");
    // 型の指示の中の「」を言い回しとして拾っていない
    expect(h2.split("\n")[0]).not.toContain("よく聞きます");
  });
  it("型に当たらない言い回しには何も添えない", () => {
    expect(dupRetryHint(null, "夜21時まで開けている").split("\n").length).toBe(1);
  });
});

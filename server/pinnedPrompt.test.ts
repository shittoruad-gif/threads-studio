import { describe, it, expect } from "vitest";
import { generateThreadsPrompt } from "../shared/threadsPrompts";

/**
 * 固定投稿のプロンプトに、実測ノウハウ（POST_TYPE_SUPPLEMENTS.pinned）が
 * 必ず入ることの確認。定義だけあって配線されておらず、固定投稿が
 * ノウハウ無視の内容で出ていた（2026-09-02検出）ことへの再発防止。
 */
const BASE = {
  postType: "pinned" as const,
  purpose: "cv" as const,
  storeName: "テスト整体院",
  businessType: "整体院",
  area: "岡山市北区",
  target: "肩こりの30代女性",
  mainProblem: "慢性肩こり",
  strength: "国家資格者",
  links: [{ type: "line", label: "公式LINE", url: "https://lin.ee/x" }],
  useThreadsKnowhow: true,
};

describe("固定投稿プロンプトのノウハウ反映", () => {
  const prompt = generateThreadsPrompt({
    ...BASE,
    counseling: { brandVoice: "やわらかい敬語", menu: ["整体60分"] },
    ngWords: ["根本改善"],
  } as any);

  it("構成ルール（7つの必須要素）が入る", () => {
    expect(prompt).toContain("固定投稿（プロフィール固定用）の構成ルール");
    expect(prompt).toContain("400〜500文字");
    expect(prompt).toContain("固定投稿表示5万3000回"); // 実例の勝ちパターン
  });

  it("URLは本文でなくコメント欄へ誘導する指示が入る", () => {
    expect(prompt).toContain("コメント欄のリンクから");
    expect(prompt).toContain("生のURL");
  });

  it("カウンセリング結果とNGワードが入る", () => {
    expect(prompt).toContain("やわらかい敬語");
    expect(prompt).toContain("根本改善");
  });

  it("通常投稿のプロンプトには固定投稿の構成ルールを混ぜない", () => {
    const daily = generateThreadsPrompt({
      postType: "empathy",
      businessType: "整体院",
      area: "岡山",
      target: "x",
      mainProblem: "y",
      strength: "z",
    } as any);
    expect(daily).not.toContain("固定投稿（プロフィール固定用）の構成ルール");
  });
});

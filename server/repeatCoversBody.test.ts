import { describe, it, expect } from "vitest";
import { findRepeatedPhraseExcept, repeatCoversBody } from "../shared/jpQualityGuard";

/**
 * 保証パスでも「本文のほとんどが直近の1本と同じ文」は出さない（2026-11-14 夜間整備）。
 * 本番の実例：acc42 #6957・#6958（同じ日の分の承認カードが、1行目だけ違う同じ文で2本届いた）。
 */
describe("repeatCoversBody（本文のほとんどが直近の投稿と同じ文か）", () => {
  const p6957 = "岡山も秋が深まってきましたね💫\n\nこの時期、ついつい食べすぎちゃう岡山名物って何ですか？";
  const p6958 = "岡山もすっかり秋ですね💫\n\nこの時期、ついつい食べすぎちゃう岡山名物って何ですか？";

  it("実例：#6958 は #6957 と本文のほとんどが同じ → 書き直す", () => {
    // 店名・地名を外した点検でも言い回しは見つかる（保証パスではここまでは「届ける」扱いだった）
    expect(findRepeatedPhraseExcept(p6958, [p6957], { stripWords: ["岡山"] })).toBeTruthy();
    expect(repeatCoversBody(p6958, [p6957])).toContain("この時期ついつい食べすぎちゃう岡山名物って何ですか");
  });

  it("長い投稿の中の決め台詞1つは、これまでどおり保証パスで届ける", () => {
    const recent = "『MIRACLE Link』は、新しい視点やビジネスのヒントが見つかる場所。\n出逢いが未来を変えるきっかけになります🙌";
    const text = "10年お店を経営して気づいたこと。\n\nそれは、どんな人も「自分に自信がない」ってこと。\n\n岡山駅周辺で、新しい一歩を踏み出したいあなたを応援します。\n出逢いが未来を変えるきっかけになります。";
    expect(findRepeatedPhraseExcept(text, [recent])).toBeTruthy();
    expect(repeatCoversBody(text, [recent])).toBeNull();
  });

  it("同じ季節の入りでも、問いかけが別なら対象にしない", () => {
    expect(repeatCoversBody("岡山もすっかり秋ですね💫\n\n岡山駅西口って、待ち合わせに便利だけどちょっと迷いません？", [p6957])).toBeNull();
  });

  it("短い本文・一致なしは null", () => {
    expect(repeatCoversBody("岡山駅の西口、迷いません？", ["岡山駅の西口、迷いません？"])).toBeNull();
    expect(repeatCoversBody(p6958, [])).toBeNull();
    expect(repeatCoversBody("", [p6957])).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { bigramSimilarity, bestPastedMatch, PASTED_EDIT_MIN_SIMILARITY } from "../shared/postMatch";

// 2026-10-08 プレステージ様：投稿カードの本文の1行目を直して、ボタンを押さずに送り返された
const original = "未経験で入社。3ヶ月の研修で、本当に指名もらえる？\n\nプレステージは未経験者が8割以上。\n\n先輩がしっかりサポートします。";
const edited = "未経験で入社。不安もたくさんありますよね。\n\nプレステージは未経験者が8割以上。\n\n先輩がしっかりサポートします。";

describe("直して送り返された文の見分け", () => {
  it("1行目を直しただけの文は、その投稿の修正として拾う（頭の30字の一致では拾えなかった）", () => {
    expect(bigramSimilarity(edited, original)).toBeGreaterThanOrEqual(PASTED_EDIT_MIN_SIMILARITY);
    const other = { id: 2, postContent: "エステの仕事は、実はチーム戦。\n\n川崎のプレステージは、みんなで支え合って働いています。" };
    const m = bestPastedMatch(edited, [other, { id: 1, postContent: original }])!;
    expect(m.post.id).toBe(1);
    expect(m.identical).toBe(false);
  });
  it("そのまま送り返された文は「同じ」と分かる", () => {
    expect(bestPastedMatch(original, [{ postContent: original }])!.identical).toBe(true);
  });
  it("別の話（材料・ご質問）は拾わない", () => {
    expect(bestPastedMatch("入社された方のお声です。最初は不安でしたが、先輩が優しく教えてくれて、3か月で指名をいただけました。", [{ postContent: original }])).toBeNull();
    expect(bestPastedMatch("投稿の時間を変えたいです", [{ postContent: original }])).toBeNull();
  });
});

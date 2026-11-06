import { describe, it, expect } from "vitest";
import { claimDeclinedWords } from "../shared/freshTopic";

// 2026-11-07：「言っていることが違う」で3回見送られた「海外訪問」の話が、はじめの設定の体験談から毎回作られていた
const materials = [
  "園遊会に招待された方\n文化勲章の授賞式に参列される方\n講演会で登壇された方\n海外訪問へ行かれる際\nお茶席\n発表会",
  "敷居が高くて入りづらい\n寸法を直したいけどどうしたら良いかわからない",
  "紬", "小紋", "訪問着", "振袖",
];
const protect = ["呉服店テスト本店", "岡山", "呉服小売店"];

describe("「言っていることが違う」で見送られた話題の言葉", () => {
  it("見送られた投稿に出た体験談の言葉（語の頭の最短）を返す", () => {
    const w = claimDeclinedWords({
      claimDeclined: ["海外へのお出かけ、お着物の寸法、気になりますよね", "海外訪問へ行かれる際、着物って大変そう…"],
      materials, protect, recentPosts: ["大切なお着物、寸法が気になりますよね。お直しを承ります"],
    });
    expect(w).toEqual(["海外"]);
  });

  it("ほかの材料の行にも出る言葉（「訪問」と「訪問着」）は取らない", () => {
    const w = claimDeclinedWords({ claimDeclined: ["訪問のときのお着物"], materials, protect });
    expect(w).not.toContain("訪問");
  });

  it("店名・地名、直近に公開した投稿に出ている言葉は取らない", () => {
    const w = claimDeclinedWords({
      claimDeclined: ["岡山のお茶席で着る一枚"],
      materials: [...materials, "岡山の本店"],
      protect,
      recentPosts: ["お茶席の着物"],
    });
    expect(w).toEqual([]);
  });

  it("直近の投稿に見送った下書きそのものが入っていても、その言葉は取る", () => {
    const declined = "海外訪問へ行かれる際、大切なお着物のお手入れ、どうしようと迷いますよね。";
    const w = claimDeclinedWords({ claimDeclined: [declined], materials, protect, recentPosts: [declined, "秋の会のお着物"] });
    expect(w).toEqual(["海外"]);
  });

  it("見送りが無ければ何も返さない（ふつうのお客様の生成は変わらない）", () => {
    expect(claimDeclinedWords({ claimDeclined: [], materials, protect })).toEqual([]);
  });
});

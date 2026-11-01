import { describe, it, expect } from "vitest";
import { treeSplit, treeArm, inTreeTrial } from "../shared/treeTrial";

describe("ツリーの試し（2026-11-02）", () => {
  it("最初の1文を1本目、残りを2本目に", () => {
    expect(treeSplit("玉島で肩が上がらない人、多いです。\n\nデスクワークのあと、腕を上げると首まで固まる。そんな方が今週3人いました。")).toEqual([
      "玉島で肩が上がらない人、多いです。",
      "デスクワークのあと、腕を上げると首まで固まる。そんな方が今週3人いました。",
    ]);
  });
  it("1文目が短すぎれば次の区切りまで", () => {
    expect(treeSplit("寒い！\n朝の金光、ほんとに冷えますね。\nこの時期は腰の重さを訴える方が増えます。体を冷やさない工夫を。")?.[0]).toBe("寒い！\n朝の金光、ほんとに冷えますね。");
  });
  it("1文目が50字を超える・残りが短いときは分けない", () => {
    expect(treeSplit("あ".repeat(60) + "。残りの文章がここに続いていて二十字は超えています。")).toBeNull();
    expect(treeSplit("玉島で肩が上がらない人、多いです。短い残り。")).toBeNull();
  });
  it("交互と期間", () => {
    expect(treeArm(5711)).toBe("tree");
    expect(treeArm(5712)).toBe("single");
    expect(inTreeTrial(10, Date.parse("2026-11-03T10:00:00+09:00"))).toBe(true);
    expect(inTreeTrial(42, Date.parse("2026-11-03T10:00:00+09:00"))).toBe(false);
    expect(inTreeTrial(36, Date.parse("2026-11-17T10:00:00+09:00"))).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { splitToList } from "../shared/answerText";

/**
 * はじめの設定の答えを一覧に分けるときの確認。
 * 先頭の数字を落としてしまい「4代目」が「代目」、「12年営業」が「年営業」になっていた（2026-09-06）。
 * 実績はいちばん大事な事実なので、数字が欠けてはいけない。
 */
describe("答えを一覧に分ける", () => {
  it("先頭が数字の答えを、そのまま残す", () => {
    expect(splitToList("創業130年、4代目")).toEqual(["創業130年", "4代目"]);
    expect(splitToList("12年営業\n3回で楽になった")).toEqual(["12年営業", "3回で楽になった"]);
    expect(splitToList("2店舗・8000人")).toEqual(["2店舗", "8000人"]);
  });

  it("「1.」「2)」のような番号と箸書き記号は落とす", () => {
    expect(splitToList("1. 骨盤矯正\n2) 猫背改善\n(3) 鍼灸\n- 整体\n・もみほぐし")).toEqual([
      "骨盤矯正", "猫背改善", "鍼灸", "整体", "もみほぐし",
    ]);
  });

  it("空・「なし」は空の一覧になる", () => {
    expect(splitToList("")).toEqual([]);
    expect(splitToList("なし")).toEqual([]);
  });
});

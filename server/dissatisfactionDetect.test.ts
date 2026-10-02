import { describe, expect, it } from "vitest";
import { isDissatisfaction } from "../shared/dissatisfactionDetect";

describe("isDissatisfaction（ご不満は自動応答で答えても担当者へ）", () => {
  it("2026-10-01 香取様 #52 の文面を拾う", () => {
    const q =
      "提案される投稿案は文章としては不自然なことかほとんどなのでそのまま投稿しようとは思いません。\n" +
      "細かく修正していけば良いのかもしれませんが、それでは自分でAIを使って投稿する方が労力がありません。\n\n" +
      "現状は投稿案から自分で作成した方が良いと思っています。";
    expect(isDissatisfaction(q)).toBe(true);
  });

  it.each([
    "正直、使えないです",
    "解約を考えています",
    "続けるか迷っています",
    "自分で書いた方が早いです",
  ])("ご不満の言い方: %s", (q) => {
    expect(isDissatisfaction(q)).toBe(true);
  });

  it.each([
    "解約の方法を教えてください",
    "ログインできません",
    "本日のzoomのURL教えていただきたいです",
    "投稿時間を変えたいです",
  ])("操作のお尋ねは拾わない: %s", (q) => {
    expect(isDissatisfaction(q)).toBe(false);
  });

  it("投稿文の貼り付けは拾わない", () => {
    const post =
      "腰が痛い場所を揉んでも、実は意味ないんです。\n\n茨城県土浦市で腰痛に悩む方。\n原因は別の場所かもしれませんね😅\n\nあなたの腰痛、どんな時に一番つらいですか？";
    expect(isDissatisfaction(post)).toBe(false);
  });
});

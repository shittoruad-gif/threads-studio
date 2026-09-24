import { describe, it, expect } from "vitest";
import { naturalnessRetryHint } from "../shared/naturalnessRetryHint";

describe("naturalnessRetryHint", () => {
  it("一般的と判定されたら、この店を指す言葉を入れる指示を足す（9/24 比嘉様の実例）", () => {
    const h = naturalnessRetryHint(
      ['"30代からの女性に多いのは、「なんとなく不調」です。" - はいさい整骨院での観察だと示されておらず、どの店でも出せる一般的な内容になっている。'],
      "はいさい整骨院／勝田台／11年",
    );
    expect(h).toContain("不自然と判定された箇所");
    expect(h).toContain("はいさい整骨院／勝田台／11年");
    expect(h).toContain("季節のあいさつ");
  });
  it("「独自性がありません」も一般的として扱う", () => {
    expect(naturalnessRetryHint(["どの整骨院でも言える内容で、店主の言葉としての独自性がありません"], null)).toContain("登録された地名");
  });
  it("一般的でない指摘には足さない（今までと同じ）", () => {
    const h = naturalnessRetryHint(["笑顔で過ごせる毎日になります。"], "はいさい整骨院");
    expect(h).toBe("- 不自然と判定された箇所：「笑顔で過ごせる毎日になります。」");
  });
  it("指摘が空なら今までの既定文", () => {
    expect(naturalnessRetryHint([], "x")).toBe("- 店主が自分で打った文に見えない（説明文・汎用の締め）");
  });
});

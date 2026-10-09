import { describe, it, expect } from "vitest";
import { naturalnessRetryHint, earlierRejectedNote } from "../shared/naturalnessRetryHint";

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

describe("earlierRejectedNote（同じ枠で落ちた文をまとめて渡す・10/9 acc33 slot0）", () => {
  it("これまでに落ちた文を並べ、同じ話から入らない指示を出す", () => {
    const n = earlierRejectedNote(
      ["セルフマッサージでは変わらないセルライト。", "セルフマッサージでセルライトは減らない。", "その深部に熟練の技でアプローチするのが"],
      ["セルフマッサージ、太もものデコボコ減らない。"],
    );
    expect(n).toContain("この枠でこれまでにも不自然と判定された文");
    expect(n).toContain("「セルフマッサージでは変わらないセルライト。」");
    expect(n).toContain("「セルフマッサージでセルライトは減らない。」");
    expect(n).toContain("別の材料で書く");
  });
  it("今回の指摘と同じ文・説明部分は重ねない", () => {
    const n = earlierRejectedNote(['"大切なメッセージを届ける特別な日。" - 抽象的で、この店の投稿として具体性に欠けます。'], ["大切なメッセージを届ける特別な日。"]);
    expect(n).toBe("");
  });
  it("初回（これまでの文が無い）は空文字", () => {
    expect(earlierRejectedNote([], ["x"])).toBe("");
  });
});

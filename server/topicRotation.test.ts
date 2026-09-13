import { describe, it, expect } from "vitest";
import { splitTopics, pickRotatingTopic } from "../shared/topicRotation";
import { generateThreadsPrompt } from "../shared/threadsPrompts";

/**
 * 登録された悩み・強みを日替わりで取り上げる（2026-09-14）。
 * 直近30日の ✕ 24本のうち17本が2名に集中し、どちらも「毎回いちばん上の1つだけ」が原因だった。
 */
describe("今日取り上げる悩み・強みを選ぶ", () => {
  // 香取様（userId 3500）の実際の登録内容
  const katori = "スポーツによる腰痛や膝の痛み、ケガ（捻挫、肉離れ、突き指）\n慢性的な腰痛、膝痛、首肩の痛み\n交通事故後の身体の痛み";
  // 岩根様（userId 5443）の実際の登録内容
  const iwane = "本物の正絹の着物を扱っている。\n\nお茶をされている方に、\nお琴をされている方に、\n踊りをされている方に、\n購入して頂いて";

  it("改行で分かれた悩みを、それぞれ取り出す", () => {
    const t = splitTopics(katori);
    expect(t.length).toBe(3);
    expect(t[2]).toBe("交通事故後の身体の痛み");
  });

  it("日ごとに順番に変わる（3日で一巡して戻る）", () => {
    const seen = [0, 1, 2, 3].map((i) => pickRotatingTopic(katori, i));
    expect(new Set(seen.slice(0, 3)).size).toBe(3); // 3日で3つとも出る
    expect(seen[3]).toBe(seen[0]);                  // 4日目で先頭に戻る
  });

  it("1つしか登録が無い方には何もしない（今までどおり）", () => {
    expect(pickRotatingTopic("敷居が高いと思われている？", 0)).toBe("");
    expect(pickRotatingTopic("", 3)).toBe("");
    expect(pickRotatingTopic(null, 1)).toBe("");
  });

  it("箇条書きの記号・番号は落とす", () => {
    expect(splitTopics("・慢性的な肩こり\n・繰り返す腰痛\n1. 産後の骨盤")).toEqual(
      ["慢性的な肩こり", "繰り返す腰痛", "産後の骨盤"],
    );
  });

  it("同じ項目は1つにまとめ、短すぎるものは拾わない", () => {
    expect(splitTopics("慢性的な肩こり\n慢性的な肩こり。\nはい")).toEqual(["慢性的な肩こり"]);
  });

  it("文の途中で折り返しただけの文章は、日替わりにしない", () => {
    // 岩根様の「強み」は1つの文が改行で折り返されている。ここを項目として取り出すと
    // 「今日使う強みは『購入して頂いて』」という無茶な指示になってしまう。
    expect(splitTopics(iwane)).toEqual([]);
    expect(pickRotatingTopic(iwane, 0)).toBe("");
  });

  it("読点で終わる行も、それ1つで完結していれば項目として扱う", () => {
    // 氷見様（userId 2907）の悩みの1行目。読点で終わるが「〜方、」で1項目として完結している。
    const himi = "今まで、何をやっても良くならなかった方、何処へ行っても良くならなかった方、手術を勧められた方、\n自律神経の乱れ・不眠\n膝の痛み\n繰り返す腰痛、坐骨神経痛、椎間板ヘルニア";
    expect(splitTopics(himi).length).toBe(4);
    expect(pickRotatingTopic(himi, 1)).toBe("自律神経の乱れ・不眠");
  });

  it("1項目の中の読点では切らない", () => {
    // 「腰痛や膝の痛み、ケガ（捻挫、肉離れ、突き指）」で1つの悩み
    expect(splitTopics(katori)[0]).toBe("スポーツによる腰痛や膝の痛み、ケガ（捻挫、肉離れ、突き指）");
    expect(splitTopics("スポーツのケガに強い、夜２１時まで営業、院長の経験豊富").length).toBe(1);
  });

  it("指定した悩みがプロンプトに「今日の主題」として入る", () => {
    const p = generateThreadsPrompt({
      businessType: "整骨院", area: "茨城県土浦市",
      target: "スポーツをする学生", mainProblem: katori, strength: "夜21時まで営業",
      focusProblem: "交通事故後の身体の痛み",
      postType: "hook_tree", treeCount: 0,
    } as any);
    expect(p).toContain("今日この1本で取り上げる悩み：交通事故後の身体の痛み");
    expect(p).toContain("他の悩みは今日は書かない");
  });

  it("指定が無ければ、その行はプロンプトに出ない", () => {
    const p = generateThreadsPrompt({
      businessType: "整骨院", area: "茨城県土浦市",
      target: "スポーツをする学生", mainProblem: katori, strength: "夜21時まで営業",
      postType: "hook_tree", treeCount: 0,
    } as any);
    expect(p).not.toContain("今日この1本で取り上げる悩み");
  });
});

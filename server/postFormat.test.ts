import { describe, it, expect } from "vitest";
import { softWrapLongLines, breakCrampedParagraphs } from "../shared/postFormat";

describe("softWrapLongLines", () => {
  it("短い行はそのまま", () => {
    const t = "倉敷市玉島で、猫背が気になるあなたへ。\n\n運動はきついものだと思っていませんか？";
    expect(softWrapLongLines(t)).toBe(t);
  });
  it("90字を超える段落だけ、文末で改行を入れる", () => {
    const s1 = "多くの方が腰痛を感じると、腰を直接揉んだりストレッチしたりしますよね。";
    const s2 = "もちろんそれらのケアも大切ですが、それだけでは一時的な改善に留まってしまうことがあります。";
    const s3 = "なぜなら腰痛の根本には日々の呼吸の仕方が深く関わっている場合があるからです。";
    const out = softWrapLongLines(s1 + s2 + s3, 90);
    expect(out.split("\n").length).toBeGreaterThanOrEqual(2);
    for (const l of out.split("\n")) expect(Array.from(l).length).toBeLessThanOrEqual(90);
    expect(out.replace(/\n/g, "")).toBe(s1 + s2 + s3);
  });
});

describe("breakCrampedParagraphs", () => {
  it("2文までの段落はそのまま", () => {
    const t = "倉敷市玉島で、猫背が気になるあなたへ。運動はきついものだと思っていませんか？\n一緒にどうですか？😊";
    expect(breakCrampedParagraphs(t)).toBe(t);
  });
  it("3文以上詰まった段落を、文末で1〜2文ずつに分ける（文は変えない）", () => {
    const t = "繰り返す腰痛で練習に集中できない高校生へ。安静だけでは、根本は変わりません。倉敷市での運動指導で、3週間でグラウンド復帰した子もいます！目標達成まで一緒にサポートしたいです😊";
    const out = breakCrampedParagraphs(t);
    expect(out.replace(/\n/g, "")).toBe(t);
    expect(out.split("\n")).toEqual([
      "繰り返す腰痛で練習に集中できない高校生へ。安静だけでは、根本は変わりません。",
      "倉敷市での運動指導で、3週間でグラウンド復帰した子もいます！",
      "目標達成まで一緒にサポートしたいです😊",
    ]);
  });
  it("もともと改行がある投稿の、60字以内の2文の段落は残す", () => {
    const t = "車検は満了日の2ヶ月前から受けても、次の満了日は短くなりません。2025年4月からの新しいルールです。\nこれ、意外と知らない方も多いです😊\n早めに済ませておく派ですか？それともギリギリ派ですか？";
    expect(breakCrampedParagraphs(t)).toBe(t);
  });
  it("「？笑」の「笑」だけを次の行に落とさない", () => {
    const t = "岡山も朝晩は冷え込んできましたね。もう暖房つけました？笑\n\n株式会社しっとるより。";
    expect(breakCrampedParagraphs(t)).toBe(t);
  });
  it("かぎかっこの中の？では切らず、文中の絵文字は文末として扱う", () => {
    const t = "「インスタ広告、何から始めたらいいですか？」ってよく聞かれます。まずは、誰に届けたいか。ここを考えるのが最初の一歩です。あなたの届けたい相手はどんな人ですか？😊";
    const out = breakCrampedParagraphs(t);
    expect(out.replace(/\n/g, "")).toBe(t);
    expect(out.startsWith("「インスタ広告、何から始めたらいいですか？」ってよく聞かれます。")).toBe(true);
    for (const l of out.split("\n")) expect(l.startsWith("」")).toBe(false);
    const t2 = "一人でApexしてて、悔しい時、ありますよね。そんな時、話せる人がいたら最高だなって思います😊一緒にどうですか？";
    expect(breakCrampedParagraphs(t2).split("\n").length).toBeGreaterThanOrEqual(2);
  });
});

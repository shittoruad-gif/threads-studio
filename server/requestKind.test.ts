import { describe, it, expect } from "vitest";
import { classifyRequestKind, isPastedContent } from "../shared/requestKind";

/**
 * AIが答えられなかったご質問のうち、担当者へ自動で通知するのは
 * classifyRequestKind が null（＝ご依頼でも投稿の材料でもない）のものだけ。
 * 実際に届いたご質問で、仕分けが変わっていないかを見る。
 */
describe("担当者へ通知するか（実際に届いたご質問で確認）", () => {
  const notify = (t: string) => classifyRequestKind(t) === null;

  it("困っているご連絡は通知する", () => {
    // #4 株式会社プレステージ様・4日間そのままだったご連絡
    expect(notify("連携したようですが、LINEに戻りません")).toBe(true);
    expect(notify("来月の私の請求額を教えてください")).toBe(true);
    expect(notify("ログインできません")).toBe(true);
    expect(notify("https://lin.ee/ZB0cQ0h")).toBe(true);
  });

  it("投稿文の貼り付けは通知しない", () => {
    // #5 氷見様が送られた固定投稿の文案（絵文字つきの長文）
    const pasted =
      "医学博士・整形外科医ご推薦の整体技術！！🔥 富山県唯一‼️\n\n＼世界レベルの整体技術／\n\n" +
      "【世界の小波津式🥇】(神経の整体)\n・最上級の認定院セミナー！！\n\n「もう無理…」\n\n「手術しかない…」\n\n" +
      "そんなあなたへ。\n\nまだ、諦めないでください。\n\n🌿 よくなる整体院\n富山県滑川市｜約30年｜延べ3万人以上";
    expect(isPastedContent(pasted)).toBe(true);
    expect(notify(pasted)).toBe(false);
  });

  it("実績・お客様のエピソードは通知しない", () => {
    // #3 香取様が送られた症例
    const material =
      "小学生が足を捻って我慢していたが、当院に来てエコー観察したら骨折があった（整形外科で確定診断）、" +
      "当院でリハビリを行い問題なくサッカーに復帰";
    expect(classifyRequestKind(material)).toBe("material");
    expect(notify(material)).toBe(false);
  });

  it("投稿の依頼は通知しない", () => {
    expect(classifyRequestKind("お盆休みの告知を投稿してください")).toBe("post");
    expect(notify("お盆休みの告知を投稿してください")).toBe(false);
  });

  it("疑問符があれば、長くても貼り付け扱いにしない", () => {
    const q = "あ".repeat(200) + "でよろしいでしょうか？";
    expect(isPastedContent(q)).toBe(false);
  });
});

describe("短い投稿文の断片も、ご質問として扱わない", () => {
  it("絵文字つき・3行以上・60字以上は貼り付け扱い（#7 氷見様）", () => {
    const t =
      "富山市から10代から慢性肩こりの20代👩\n" +
      "“こんなに軽くなったことない〜！！”\n" +
      "全身ユルユルになって、ルンルン🎶で帰られました🥺\n" +
      "📍滑川市の一回で効果を実感できる整体院";
    expect(isPastedContent(t)).toBe(true);
    expect(classifyRequestKind(t)).toBe("pasted");
  });

  it("短い困りごとは、貼り付けに巻き込まない", () => {
    expect(isPastedContent("投稿が来ません")).toBe(false);
    expect(isPastedContent("ログインできない\n助けてください")).toBe(false);
    expect(classifyRequestKind("投稿が来ません")).toBe(null);
  });
});

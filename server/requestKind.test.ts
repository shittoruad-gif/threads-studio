import { describe, it, expect } from "vitest";
import { classifyRequestKind, isPastedContent, wantsTodayPosts, wantsNgWord } from "../shared/requestKind";
import { isFeatureRequest } from "../shared/requestDetect";

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

/**
 * 2026-09-08 ご質問 #21（呉服店様）。
 * ご自身の投稿文（前夜に公開ずみ）をそのまま送り返されたのに、
 * 締めの問いかけ「？」があるためご質問として扱われ、
 * 文中の「感じてほしい」に反応して
 * 「ご要望として承りました。夜の更新で反映します」と返していた。
 */
describe("読み手への問いかけで締める投稿文（#21 呉服店様）", () => {
  const post =
    "着物と聞くと、特別な日だけだと思われがち。\n\n" +
    "日常のお出かけにいかがですか？\n\n" +
    "着物をもっともっと身近に感じてほしいと思います😌\n\n" +
    "皆さんはどんな時に着てみたいと思われますか？";

  it("？があっても投稿文として扱う", () => {
    expect(isPastedContent(post)).toBe(true);
    expect(classifyRequestKind(post)).toBe("pasted");
  });

  it("ご要望としては受け取らない（「夜の更新で反映します」と返さない）", () => {
    expect(isFeatureRequest(post)).toBe(false);
  });

  it("はっきりしたご要望は、これまでどおり要望として受け取る", () => {
    expect(isFeatureRequest("そのままコピペできれば、修正しやすいです")).toBe(true);
    expect(isFeatureRequest("岡山市北区京橋町の言い方はやめて欲しい")).toBe(true);
  });

  it("飾りつきの長文でも、困りごとの言葉があればご質問として扱う", () => {
    const q =
      "連携できません😢\n" +
      "Threadsのボタンを押しても戻ってこないんです。\n" +
      "どうすればいいでしょうか？\n" +
      "昨日から何回も試しています。";
    expect(isPastedContent(q)).toBe(false);
  });
});

/**
 * 2026-09-08 ご質問 #22。
 * 「今日の投稿をもう一度みたい」が受け皿の言葉に当たらず自動応答へ回り、
 * 「メニューから『今日の投稿』などをお選びください」とあいまいに答えるだけだった。
 */
describe("今日の投稿を見たいというご依頼（#22）", () => {
  it("実際に届いた言い方でその場に出す", () => {
    expect(wantsTodayPosts("今日の投稿をもう一度みたい")).toBe(true);
    expect(wantsTodayPosts("今日の投稿")).toBe(true);
    expect(wantsTodayPosts("投稿を確認したい")).toBe(true);
    expect(wantsTodayPosts("今日配信予定のもの見せて")).toBe(false); // 「投稿」の語が無いのでAIに任せる
    expect(wantsTodayPosts("承認した投稿をもう一度見る")).toBe(true);
  });

  it("投稿文の貼り付けは巻き込まない", () => {
    const pasted =
      "肩こり、揉みほぐしだけだと結局戻るみたいです。\n" +
      "気持ちいいだけだと根本原因に届かないことが多いんです😅\n" +
      "あなたはどんな時に「また戻った」と感じますか？";
    expect(wantsTodayPosts(pasted)).toBe(false);
  });
});

/**
 * 2026-09-06 ご質問 #10（呉服店様）。
 * 「〇〇の言い方はやめて欲しい」に、AIが「設定メニューから登録できます」と
 * 説明するだけで、お客様がもう一度メニューをたどる必要があった。
 */
describe("使ってほしくない言葉のご要望（#10）", () => {
  it("実際に届いた言い方でNGワードの入力までお通しする", () => {
    expect(wantsNgWord("岡山市北区京橋町の言い方はやめて欲しい")).toBe(true);
    expect(wantsNgWord("化繊の話もやめて欲しい")).toBe(true);
    expect(wantsNgWord("この表現は使わないでください")).toBe(true);
  });

  it("投稿そのものを止めたいご依頼とは取り違えない", () => {
    expect(wantsNgWord("自動投稿をやめてほしい")).toBe(false);
    expect(wantsNgWord("メールの通知をやめてほしい")).toBe(false);
  });
});

/**
 * 2026-09-06 ご質問 #13。
 * 届いたご案内をまるごと引用し、その上に「このやり方がよくわかりません」と
 * 一言だけ書いて送られたのに、本文が長いため投稿文の貼り付けと判定され、
 * 「文章をお送りいただき、ありがとうございます」と返っていた。
 */
describe("引用の上に一言だけ書かれたお尋ね（#13）", () => {
  const asked =
    "このやり方がよくわかりません\n\n\n" +
    "【Meta AI呼びかけ投稿の、やり直しのお願い】\n" +
    "今朝の自動投稿「@meta.ai …」は、Threadsの仕様で自動投稿（API）からだと@meta.aiが" +
    "メンションにならず、Meta AIの返事が付きませんでした。申し訳ありません。\n" +
    "お手数ですが、下の手順で1回だけ投稿してください。今朝の投稿は消さなくて大丈夫です。\n\n" +
    "■ 投稿するアカウント\n@yokunaru4976seitai\n\n" +
    "■ 投稿する文章\n@meta.ai 滑川市上小泉周辺の人に、うちのお店を届けて";

  it("投稿文の貼り付けにしない（ご質問として自動応答へ回す）", () => {
    expect(isPastedContent(asked)).toBe(false);
    expect(classifyRequestKind(asked)).toBe(null);
  });

  it("一言が無い引用は、これまでどおり貼り付け扱い", () => {
    const pasted =
      "医学博士・整形外科医ご推薦の整体技術！！🔥 富山県唯一‼️\n\n＼世界レベルの整体技術／\n\n" +
      "【世界の小波津式🥇】(神経の整体)\n・最上級の認定院セミナー！！\n\n「もう無理…」\n\n" +
      "そんなあなたへ。\n\n🌿 よくなる整体院\n富山県滑川市｜約30年｜延べ3万人以上";
    expect(isPastedContent(pasted)).toBe(true);
  });
});

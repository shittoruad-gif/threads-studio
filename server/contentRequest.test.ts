import { describe, it, expect } from "vitest";
import {
  detectContentRequest,
  looksLikeContentWish,
  aiMayProposeRules,
  sanitizeRuleText,
  contentRequestFromAi,
  buildProposalText,
  parseProposalRules,
  registeredText,
  cleanTopic,
} from "../shared/contentRequest";
import { hasUnkeptPromise } from "../shared/supportAnswerGuard";
import { OWNER_RULES } from "../shared/ownerRules";

/**
 * 2026-11-03 三上様「そのような問い合わせに対して、自動的にきちんと反映できるようなシステムを組み込んで」。
 * 公式LINEの自由文が「投稿の中身についてのご希望」かを見分け、書き方の決まりの文に整える（shared/contentRequest.ts）。
 */
const rulesOf = (t: string) => detectContentRequest(t)?.rules.map((r) => r.rule) ?? null;

describe("当たる文：投稿の中身についてのご希望", () => {
  const HITS: [string, string[]][] = [
    ["運動療法、リハサクをお勧めしたい", ["運動療法やリハサクをおすすめする"]],
    ["スポーツ選手の話題はいらない", ["スポーツ選手の話題は書かない"]],
    ["岡山市北区京橋町の言い方はやめて欲しい\n化繊の話もやめて欲しい", ["「岡山市北区京橋町」という言い方は使わない", "化繊の話題は書かない"]],
    ["政治の話は書かないでください", ["政治の話題は書かない"]],
    ["スポーツ選手のことは投稿に出さないで", ["スポーツ選手の話題は書かない"]],
    ["「激安」という言葉は使わないで", ["「激安」という言い方は使わない"]],
    ["宣伝っぽい投稿はいらない", ["宣伝っぽい投稿は書かない"]],
    ["お世話になっております。\n恋愛の話題はいらないです。", ["恋愛の話題は書かない"]],
    ["産後ケアの話をもっと増やしてほしい", ["産後ケアの話を多めに入れる"]],
    ["うちのオリジナルの体操を紹介したい", ["うちのオリジナルの体操を紹介する"]],
    ["インナーマッスルの話を投稿に入れてほしい", ["インナーマッスルを投稿に取り入れる"]],
    ["絵文字を減らして", ["絵文字は少なめにする（1つの投稿に1〜2個まで）"]],
    ["絵文字なしでお願いします", ["絵文字は使わない"]],
    ["もっと短くして", ["投稿は短めに書く"]],
    ["ハッシュタグはいらないです", ["ハッシュタグは付けない"]],
    ["改行を増やしてもらえますか？", ["改行を多めにして読みやすくする"]],
    ["敬語で書いてほしい", ["です・ます調の丁寧な言葉で書く"]],
    ["「患者さん」ではなく「お客さま」と書いてください", ["「患者さん」ではなく「お客さま」と書く"]],
    ["最後は「ご予約はLINEから」で締めてください", ["最後は「ご予約はLINEから」で締める"]],
  ];
  for (const [text, want] of HITS) {
    it(`「${text.replace(/\n/g, " / ")}」→ ${want.join(" / ")}`, () => {
      expect(rulesOf(text)).toEqual(want);
    });
  }
  it("決まりの文はどれも80字以内（OWNER_RULES.maxLen）", () => {
    for (const [text] of HITS) for (const r of rulesOf(text) ?? []) expect(Array.from(r).length).toBeLessThanOrEqual(OWNER_RULES.maxLen);
  });
  it("避けたい話題は、短い言葉ならNGワードの候補も持つ（雰囲気の話「〜っぽい」は持たない）", () => {
    expect(detectContentRequest("スポーツ選手の話題はいらない")?.rules[0].ngWord).toBe("スポーツ選手");
    expect(detectContentRequest("宣伝っぽい投稿はいらない")?.rules[0].ngWord).toBeUndefined();
    expect(detectContentRequest("運動療法、リハサクをお勧めしたい")?.rules[0].ngWord).toBeUndefined();
  });
});

describe("当たらない文：ふつうのご質問・操作の相談・設定のご希望", () => {
  const MISSES = [
    "固定投稿はどこにある？",
    "絵文字はどうやって入れるの？",
    "通知はいらない",
    "承認はいらない",
    "お知らせはいらない",
    "LINEの案内はやめてほしい",
    "この辺を使って欲しい",
    "写真を使ってほしい",
    "毎日の投稿はいらない",
    "投稿を止めてください",
    "料金はいくらですか",
    "友だちを紹介したい",
    "アプリをおすすめしたい",
    "連携できないです",
    "今日の投稿をもう一度みたい",
    "スポーツ選手の話題はいらない？",
    "同じような投稿はいらない",
    "この投稿を短くして",
    "ありがとうございます",
    "明日は臨時休診です",
    "平日12:30ごろが希望です",
    "提案される投稿案は文章としては不自然なことかほとんどなのでそのまま投稿しようとは思いません。",
    "スポーツ選手の話題はいらない。あと固定投稿はどこにありますか",
  ];
  for (const text of MISSES) {
    it(`「${text}」は当てない`, () => {
      expect(detectContentRequest(text)).toBeNull();
    });
  }
});

describe("担当者へ回す目安（決まりの文にできなかったご希望）", () => {
  it("ご希望の言い回しには当たる", () => {
    expect(looksLikeContentWish("スポーツ選手の話題はいらない？")).toBe(true);
    expect(looksLikeContentWish("あの件の話はもう書かないでほしいです、前に言ったやつ")).toBe(true);
    expect(looksLikeContentWish("絵文字をもう少し減らしてほしいけどできる？")).toBe(true);
  });
  it("ふつうのご質問・操作のことには当たらない", () => {
    expect(looksLikeContentWish("固定投稿はどこにある？")).toBe(false);
    expect(looksLikeContentWish("アプリをおすすめしたい")).toBe(false);
    expect(looksLikeContentWish("今日は投稿が来ていません")).toBe(false);
  });
});

describe("自動の答えが出した決まりの案", () => {
  it("使ってよいのは投稿の中身に触れた文で、やり方・不具合のお尋ねは使わない", () => {
    expect(aiMayProposeRules("Metaに返答してもらう投稿で、岐阜市でと町名を無くした投稿にできますか？")).toBe(true);
    expect(aiMayProposeRules("絵文字はどうやって入れるの？")).toBe(false);
    expect(aiMayProposeRules("投稿が届かないです")).toBe(false);
    expect(aiMayProposeRules("プロプランは何アカウントまで？")).toBe(false);
  });
  it("整え方：頭の「決まり：」・かぎかっこ・句点を外し、担当者・お尋ね・長すぎは捨てる", () => {
    expect(sanitizeRuleText("決まり：呼びかけの地域は市までにする。")).toBe("呼びかけの地域は市までにする");
    expect(sanitizeRuleText("「スポーツ選手の話題は書かない」")).toBe("スポーツ選手の話題は書かない");
    expect(sanitizeRuleText("担当者が登録する")).toBeNull();
    expect(sanitizeRuleText("町名は入れますか？")).toBeNull();
    expect(sanitizeRuleText("あ".repeat(OWNER_RULES.maxLen + 1))).toBeNull();
    expect(sanitizeRuleText("承認の通知はいらない")).toBeNull();
    expect(contentRequestFromAi(["スポーツ選手の話題は書かない", "スポーツ選手の話題は書かない", ""])?.rules).toEqual([{ kind: "avoid", rule: "スポーツ選手の話題は書かない" }]);
    expect(contentRequestFromAi([])).toBeNull();
    expect(contentRequestFromAi(undefined)).toBeNull();
  });
});

describe("お客様にお出しする文", () => {
  it("確認の文に決まりを「」で1行ずつ出し、記録から読み戻せる", () => {
    const text = buildProposalText(["スポーツ選手の話題は書かない", "絵文字は使わない"]);
    expect(text).toContain("次の決まりとして登録します。よろしいですか。");
    expect(text).toContain("\n「スポーツ選手の話題は書かない」\n「絵文字は使わない」\n");
    expect(parseProposalRules(text)).toEqual(["スポーツ選手の話題は書かない", "絵文字は使わない"]);
    expect(buildProposalText(["a"], { multiAccount: true })).toContain("どのアカウントの決まりにするか");
  });
  it("登録後の文：明日以降に作る投稿から・見直す場所", () => {
    const t = registeredText(["スポーツ選手の話題は書かない"], { ngWords: ["スポーツ選手"] });
    expect(t).toContain("明日以降に作る投稿から反映します");
    expect(t).toContain("「設定」→「書き方の決まり」で見直せます");
    expect(t).toContain("NGワード");
  });
  it("お客様に届く文に絵文字・「AIが」を入れない", () => {
    const all = [buildProposalText(["x"]), registeredText(["x"])].join("\n");
    expect(all).not.toMatch(/AIが/);
    expect(all).not.toMatch(/[\uD83C-\uDBFF][\uDC00-\uDFFF]/);
  });
  it("並びは「や」でそろえ、つなぎ言葉を外す", () => {
    expect(cleanTopic("運動療法、リハサク")).toBe("運動療法やリハサク");
    expect(cleanTopic("もうスポーツ選手のこと")).toBe("スポーツ選手");
  });
});

describe("自動の答えの約束文の検査（shared/supportAnswerGuard.ts）", () => {
  const PROMISES = [
    "「運動療法」や「リハサク」をお勧めしたいというお気持ち、承知いたしました。担当者が責任をもって登録させていただきます。",
    "担当者が対応いたします。",
    "こちらで登録しておきます。",
    "承知しました。担当者より改めてご連絡いたします。",
    "スタッフが設定を変更します。",
  ];
  const OK = [
    "LINEのメニューから「設定」を選び、NGワードをご登録いただけます。",
    "「Zoom希望」とお送りいただければ、担当者より日程調整のご連絡をいたします。",
    "解決しない場合は「担当者に聞く」を押してください。",
    "担当者にお問い合わせください。",
    "プロプランでは、1日3回まで自動投稿が可能です。",
    "この内容は「お店の情報」に登録できます。",
  ];
  for (const t of PROMISES) it(`約束と見る：${t.slice(0, 24)}`, () => expect(hasUnkeptPromise(t)).toBe(true));
  for (const t of OK) it(`約束と見ない：${t.slice(0, 24)}`, () => expect(hasUnkeptPromise(t)).toBe(false));
});

describe("運営への知らせ（server/supportNotify.ts・三上様の公式LINEだけ）", () => {
  it("登録した・登録しない・担当者の対応が要る、がそれぞれ分かる", async () => {
    const { contentRuleStaffAction, staffLineNoticeText } = await import("./supportNotify");
    const reg = contentRuleStaffAction({ outcome: "registered", rules: ["スポーツ選手の話題は書かない"], ngWords: ["スポーツ選手"] });
    expect(reg.outcome).toBe("applied");
    expect(reg.action).toBe("書き方の決まりに「スポーツ選手の話題は書かない」を登録しました。NGワードにも「スポーツ選手」を足しました");
    const text = staffLineNoticeText({ ...reg, name: "QA", account: "qa_clinic", question: "スポーツ選手の話題はいらない", pressed: "登録する", reply: "登録しました。", link: "L" });
    expect(text).toContain("【自動で対応しました】QA 様（@qa_clinic）");
    expect(text).toContain("（お客様が「登録する」を押して確定）");
    const no = contentRuleStaffAction({ outcome: "declined", rules: ["a"] });
    expect(no).toEqual({ outcome: "declined", action: "決まりの案「a」は登録していません" });
    const human = contentRuleStaffAction({ outcome: "needs_human", rules: [] });
    expect(human.outcome).toBe("needs_human");
    expect(human.action).toContain("決まりの文にできませんでした");
    expect(contentRuleStaffAction({ outcome: "limit", rules: ["b"] }).outcome).toBe("needs_human");
  });
});

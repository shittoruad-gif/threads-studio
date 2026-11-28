import { describe, it, expect } from "vitest";
import {
  filterHarvested, OUTCOME_CLAIM_RE,
  isOwnSiteUrl, groundedInPage, filterSiteHarvested, eligibleReplies, replyItemContent, buildReplyItems, REPLY_HARVEST, SITE_HARVEST,
} from "../shared/materialHarvest";
import { looksLikeSpamComment } from "../shared/commentSpam";
import { buildMaterialNote } from "../shared/materialLedger";

const now = Date.parse("2026-11-28T03:00:00Z");
const recent = "2026-11-25T03:00:00+0000";

describe("ホームページから拾う（2026-11-28）", () => {
  it("ご本人のページだけを読む（まとめ・順位・SNSは読まない）", () => {
    expect(isOwnSiteUrl("https://example-seikotsu.com/")).toBe(true);
    expect(isOwnSiteUrl("https://beauty.hotpepper.jp/kr/slnH000000000/")).toBe(true);
    expect(isOwnSiteUrl("https://esthe-ranking.example.com/area/")).toBe(false);
    expect(isOwnSiteUrl("https://www.instagram.com/someone/")).toBe(false);
    expect(isOwnSiteUrl("")).toBe(false);
    expect(isOwnSiteUrl("javascript:alert(1)")).toBe(false);
  });

  const page = "当店は明治から続く呉服店です。" + "あ".repeat(400) +
    "お持ちの着物は、今の寸法に合わせて仕立て直しができます。洗い張りや染み抜きも承ります。" + "い".repeat(400) +
    "初めての方には、まず店内をご覧いただき、ご希望をうかがいます。";

  it("ページの近くの文に書いてあるものだけを通す", () => {
    expect(groundedInPage("お持ちの着物は、今の寸法に合わせて仕立て直しができます。", page)).toBeGreaterThanOrEqual(SITE_HARVEST.grounded);
    // 離れた所の言葉をつないだ文は「書いていないこと」
    expect(groundedInPage("明治から続く当店では、初めての方の染み抜きを仕立て直しでご覧いただきます。", page)).toBeLessThan(SITE_HARVEST.grounded);
  });

  it("料金・期間限定・順位・体の結果・宣伝の決まり文句は足さない", () => {
    const out = filterSiteHarvested([
      { kind: "faq", content: "お持ちの着物は、今の寸法に合わせて仕立て直しができます。", from: 1 },
      { kind: "faq", content: "洗い張りは初回3,000円で承ります。", from: 1 },
      { kind: "episode", content: "地域で口コミNo.1の呉服店です。", from: 1 },
      { kind: "episode", content: "肩こりが改善したという声をいただきました。", from: 1 },
      { kind: "episode", content: "お客様に寄り添います。", from: 1 },
      { kind: "episode", content: "まったく書かれていない新しい催事を毎月ひらいています。", from: 1 },
    ], page + "洗い張りは初回3,000円で承ります。地域で口コミNo.1の呉服店です。肩こりが改善したという声をいただきました。", []);
    expect(out.map((o) => o.content)).toEqual(["お持ちの着物は、今の寸法に合わせて仕立て直しができます。"]);
  });

  it("ネタ帳に今ある話・NGワードを含む話は足さない", () => {
    const c = [{ kind: "faq", content: "お持ちの着物は、今の寸法に合わせて仕立て直しができます。", from: 1 }];
    expect(filterSiteHarvested(c, page, ["着物は今の寸法に合わせて仕立て直しができます"])).toEqual([]);
    expect(filterSiteHarvested(c, page, [], ["仕立て直し"])).toEqual([]);
  });
});

describe("投稿に付いた返信から拾う（2026-11-28）", () => {
  const parent = "この町の冬って、朝車のフロントガラスが凍ってることが多いですよね。みなさんどうしてますか？";
  const mk = (text: string, username = "someone", parentText = parent) => ({ text, username, parentText, timestamp: recent });

  it("地元の方の返信は残す", () => {
    const out = eligibleReplies([mk("ペットボトルにぬるま湯を入れて溶かしてます。")], "sample_salon", looksLikeSpamComment, now);
    expect(out).toHaveLength(1);
  });

  it("ご本人・Meta AI・短すぎ・長すぎ・古い返信は外す", () => {
    const list = [
      mk("ペットボトルにぬるま湯を入れて溶かしてます。", "sample_salon"),
      mk("座りっぱなしの後は、固まる3箇所をほぐすのが近道です。", "meta.ai"),
      mk("駅の周辺なら歩いて行ける公園が充実してますよ", "someone", "@meta.ai この町の周辺で、子どもと一緒に楽しめる場所は？"),
      mk("コーヒー好きです"),
      mk("あ".repeat(REPLY_HARVEST.maxLen + 1)),
      { ...mk("昔は駅前にうどん屋さんがあって毎年いただいていました。"), timestamp: "2026-10-01T03:00:00+0000" },
    ];
    expect(eligibleReplies(list, "sample_salon", looksLikeSpamComment, now)).toEqual([]);
  });

  it("営業・値段・連絡先・きつい言葉・質問は外す（実際に付いた返信と同じ形）", () => {
    const list = [
      mk("はじめまして！突然のご連絡、失礼致します。県内で整骨院を経営しております。"),
      mk("ウチの近くの車検は普通車24ヶ月点検と代行で15,000円でした。"),
      mk("あの交差点はちょっと怖かったです。譲りませんよ的な動きをされました"),
      mk("詳しくはプロフのリンクから見てください。おすすめです"),
      mk("それは何時ごろまで凍っていますか？😊"),
    ];
    expect(eligibleReplies(list, "x", looksLikeSpamComment, now)).toEqual([]);
  });

  it("返信の言葉のままネタ帳の1行にする（名前は入れない）", () => {
    const line = replyItemContent(mk("ペットボトルにぬるま湯を入れて溶かしてます。", "reader_account"));
    expect(line).toContain("読んだ方から「ペットボトルにぬるま湯を入れて溶かしてます。」と返信をいただいた。");
    expect(line).not.toContain("reader_account");
    expect(line.startsWith("投稿「この町の冬って、朝車のフロントガラスが凍ってることが多いです…」に、")).toBe(true);
    expect(line).toContain("…」に、");
  });

  it("同じ投稿への返信は1回に1件・上限まで・今ある行と同じ返信は足さない", () => {
    const el = [
      mk("ペットボトルにぬるま湯を入れて溶かしてます。"),
      mk("前の晩に古い毛布をかけておくと凍りません。"),
      mk("昔は駅前にうどん屋さんがあって毎年いただいていました。", "a", "この町で、この時期に食べたくなるものって何ですか？"),
      mk("川沿いの堤防を走るのが好きです。朝は気持ちがいい", "b", "この町で車を運転していると、つい寄り道したくなる道ってありますか？"),
    ];
    const out = buildReplyItems(el, [1, 2, 3, 4, 99], []);
    expect(out).toHaveLength(REPLY_HARVEST.maxAdd);
    expect(out[0].content).toContain("ぬるま湯");
    expect(out[1].content).toContain("うどん屋");
    expect(out.every((o) => o.kind === "episode")).toBe(true);
    const again = buildReplyItems(el, [1], [out[0].content]);
    expect(again).toEqual([]);
  });

  it("返信のネタは、言い切らせない・宣伝につなげない指示で渡す", () => {
    const note = buildMaterialNote({ id: 1, kind: "episode", content: "投稿「…」に、読んだ方から「…」と返信をいただいた。", source: "replies", createdAt: new Date() });
    expect(note).toContain("読んだ方からいただいた返信");
    expect(note).toContain("言い切らない");
    expect(note).toContain("名前・アカウント名は書かない");
    const site = buildMaterialNote({ id: 2, kind: "faq", content: "仕立て直しができる。", source: "site", createdAt: new Date() });
    expect(site).toContain("お店のホームページに書かれていること");
    const form = buildMaterialNote({ id: 3, kind: "faq", content: "仕立て直しができる。", source: "form", createdAt: new Date() });
    expect(form).toContain("オーナーご本人が教えてくださったこと");
  });
});

describe("手直し投稿から拾う：体の結果を言い切る文は足さない（2026-11-28）", () => {
  it("下見で拾われていた文を外す", () => {
    for (const t of [
      "この機械は20分寝ているだけで1回で-3センチのウエスト引き締め効果があります。",
      "当店のダイエットは運動なし、きつい食事制限なしで、3ヶ月で-10㌔を目指します。",
      "30代のお客様から「一度の施術でも見た目でわかるくらいサイズダウンした」という声がある。",
      "スポーツ障害で「とりあえず安静」では治るのに時間がかかります。",
    ]) expect(OUTCOME_CLAIM_RE.test(t)).toBe(true);
    for (const t of [
      "車検は、車検満了日の2か月前から受けられます。",
      "当院では、姿勢の分析を導入しています。",
      "LINEなら営業時間外でもメッセージを送れます。",
    ]) expect(OUTCOME_CLAIM_RE.test(t)).toBe(false);
  });
  it("ふるいで落ちる", () => {
    const src = ["当店のダイエットは運動なし、きつい食事制限なしで、3ヶ月で-10㌔を目指します。無理な勧誘は一切ありません。合わないと感じたら遠慮なくお断りいただいて構いません。"];
    const out = filterHarvested([
      { kind: "episode", content: "当店のダイエットは運動なし、きつい食事制限なしで、3ヶ月で-10㌔を目指します。", from: 1 },
      { kind: "episode", content: "無理な勧誘は一切ありません。合わないと感じたら遠慮なくお断りいただいて構いません。", from: 1 },
    ], src, []);
    expect(out.map((o) => o.content)).toEqual(["無理な勧誘は一切ありません。合わないと感じたら遠慮なくお断りいただいて構いません。"]);
  });
});

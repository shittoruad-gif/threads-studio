import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { pickAngle, activeAngles, getAngle, POST_ANGLES } from "../shared/postAngles";
import { checkAngle, ANGLE_REQUIREMENTS } from "../shared/angleGuard";
import { LOCAL_TALK, LOCAL_TALK_ANGLE_ID, localTalkNote, localTalkPlaces, localTalkOptedOut } from "../shared/localTalk";
import { trialFor, LEARNING_ACCOUNTS, LOCAL_TALK_TRIAL } from "../shared/learningAccounts";
import { endsWithQuestion, findAgreementQuestion, findBannedTic, findDeadEndTeaser, checkNaturalized } from "../shared/jpQualityGuard";
import { NATURAL_STYLE_SKIP_ANGLES } from "../shared/naturalStyle";
import { findAccountBannedWord, scrubProjectForAccount, accountBannedNote, bannedRuleFor } from "../shared/accountBannedWords";
import { buildMetaAiCallPostOfKind } from "../shared/metaAiAsk";
import { identityTokens, checkIdentity } from "../shared/identityGuard";

// 2026-10-18 三上様「普段の投稿やスレッドスタジオにもこれを活かして」。
// 三上様が「かなりいい感じ」とした形（玉島・浅口・鴨方・寄島まわり）
const OWNER_APPROVED = [
  "鴨方のそうめん、冬でも食べる派ですか？笑",
  "寄島のカキってもう出てます？ 毎年いつ頃からだったか忘れちゃって💦 地元の方教えてください",
  "浅口の人に聞きたいんですけど、肩こったとき『はる』って言います？それとも『こる』？",
  "寝るとき横向きの人ー！ 朝起きたら肩バキバキになってません？",
];
// 手で書いて伸びた投稿（4,000〜5,700表示・返信10〜25）
const HAND_WRITTEN = [
  "新倉敷・玉島の名産品と言えば？ 地元の方のおすすめも、よかったら教えてください",
  "雨降ってますが、今日玉島まつりはあるんですかね？💦",
];

/** 決まった乱数（何度動かしても同じ結果） */
function seeded(seed: number) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; };
}
function shareOf(n: number, opts: Parameters<typeof pickAngle>[5] = {}, stats: Record<string, { good: number; bad: number }> = {}, mode = "store") {
  const rnd = seeded(42);
  let hit = 0;
  for (let i = 0; i < n; i++) if (pickAngle(stats, rnd, undefined, Date.parse("2026-10-18T09:00:00+09:00"), mode, opts).id === LOCAL_TALK_ANGLE_ID) hit++;
  return hit / n;
}

describe("地元の会話：ふだんの生成での割合", () => {
  it("切り口の一覧に入り、名前は「地元の会話」", () => {
    expect(POST_ANGLES.some((a) => a.id === LOCAL_TALK_ANGLE_ID)).toBe(true);
    expect(getAngle(LOCAL_TALK_ANGLE_ID)?.label).toBe("地元の会話");
    expect(activeAngles(Date.now(), "store").map((a) => a.id)).toContain(LOCAL_TALK_ANGLE_ID);
  });
  it("割合は1つの定数（LOCAL_TALK.share）で、約3本に1本（10/25 0.22→0.33）", () => {
    expect(LOCAL_TALK.share).toBeGreaterThanOrEqual(0.3);
    expect(LOCAL_TALK.share).toBeLessThanOrEqual(0.36);
    const s = shareOf(4000);
    expect(s).toBeGreaterThan(LOCAL_TALK.share - 0.03);
    expect(s).toBeLessThan(LOCAL_TALK.share + 0.03);
  });
  it("ほかの切り口の実績・希望の型があっても割合は変わらない", () => {
    const s = shareOf(4000, { preferredAngles: ["pro_tip"], recentAngles: ["aruaru", "aruaru", "aruaru"] });
    expect(s).toBeGreaterThan(LOCAL_TALK.share - 0.03);
    expect(s).toBeLessThan(LOCAL_TALK.share + 0.03);
  });
  it("試験の型（約半分）と希望の型（約35%）が両方ある運営のアカウントでは、残りの枠に収める（試験・希望の割合を削らない）", () => {
    const s = shareOf(4000, { studyExperiment: true, preferredAngles: ["pro_tip"], recentAngles: ["aruaru", "aruaru", "aruaru"] });
    expect(s).toBeGreaterThan(0.1);
    expect(s).toBeLessThan(LOCAL_TALK.share + 0.03);
  });
  it("✕が多いと下がり、◯が多いと上がる（上限 0.5）", () => {
    expect(shareOf(3000, {}, { local_talk: { good: 0, bad: 2 } })).toBeLessThan(0.05);
    const up = shareOf(3000, {}, { local_talk: { good: 5, bad: 0 } });
    expect(up).toBeGreaterThan(0.45);
    expect(up).toBeLessThan(0.55);
  });
  it("使わないお店（地域なし・言い切りで終える方・求人）は 0、割合 0 で止まる、個人ブランディングでは出ない", () => {
    expect(shareOf(1000, { excludeLocalTalk: true })).toBe(0);
    expect(shareOf(1000, { localTalkShare: 0 })).toBe(0);
    expect(shareOf(1000, {}, {}, "personal")).toBe(0);
    expect(activeAngles(Date.now(), "personal").map((a) => a.id)).not.toContain(LOCAL_TALK_ANGLE_ID);
  });
  it("お客様ごとに止める一覧（運営が足す）は、最初は空", () => {
    expect(LOCAL_TALK.optOutUserIds).toEqual([]);
    expect(localTalkOptedOut(3500)).toBe(false);
    expect(localTalkOptedOut(null)).toBe(false);
  });
  it("自然な書き方モードの方には出さない", () => {
    expect(NATURAL_STYLE_SKIP_ANGLES).toContain(LOCAL_TALK_ANGLE_ID);
  });
});

describe("地元の会話：学習用アカウントの試し", () => {
  it("学習の枠の約半分が地元の会話（10・12・36とも）", () => {
    for (const acc of LEARNING_ACCOUNTS.accountIds) {
      const keys = Array.from({ length: 30 }, (_, i) => trialFor(acc, i, Date.parse("2026-10-19T06:00:00+09:00")).key);
      expect(keys.filter((k) => k === LOCAL_TALK_ANGLE_ID).length).toBe(15);
      // 残りはほかの試し（地元の会話が2つ続けて同じ条件の比べる元にならない）
      expect(new Set(keys.filter((k) => k !== LOCAL_TALK_ANGLE_ID)).size).toBeGreaterThanOrEqual(12);
    }
  });
  it("試しの記録のキーは local_talk（学習のまとめで測れる）", () => {
    expect(LOCAL_TALK_TRIAL.key).toBe("local_talk");
    expect(LOCAL_TALK_TRIAL.label).toBe("地元の会話");
  });
});

describe("地元の会話：出来上がりの検査が落とさない／落とす", () => {
  it("三上様が良いとした形・手で書いて伸びた形は、切り口の検査を通る", () => {
    for (const t of [...OWNER_APPROVED, ...HAND_WRITTEN]) expect(checkAngle(LOCAL_TALK_ANGLE_ID, t), t).toEqual({ ok: true });
  });
  it("問いかけの締めの検査（同意を求める確認疑問・決まり文句・答えを伏せた問い）にも当たらない", () => {
    for (const t of [...OWNER_APPROVED, ...HAND_WRITTEN]) {
      expect(findAgreementQuestion(t), t).toBeNull();
      expect(findBannedTic(t), t).toBeNull();
      expect(findDeadEndTeaser(t), t).toBeNull();
    }
    expect(endsWithQuestion(OWNER_APPROVED[2])).toBe(true);
    // 会話型として問いかけの締めを許す（書き直しの検査で「問いかけに書き換えた」と言われない）。
    // ★地元の会話の回は書き直し（naturalize）をかけないので、この検査で落ちても生成した文がそのまま使われる
    const v = checkNaturalized(OWNER_APPROVED[2], "浅口では肩こったとき『はる』って言います。", { allowQuestionEnding: true });
    expect(v.reason ?? "").not.toContain("問いかけ");
    const v2 = checkNaturalized(OWNER_APPROVED[2], "浅口では肩こったとき『はる』って言います。", { allowQuestionEnding: false });
    expect(v2.ok).toBe(false);
  });
  it("宣伝・予約・料金・「〜な人へ」・国家資格・効果の話・URL は落とす", () => {
    const bad = [
      "玉島の皆さん、肩こりの方はご予約お待ちしてます！",
      "倉敷で腰痛な人へ。国家資格者が整えます。どう思います？",
      "玉島のそうめん好きですか？ 初回2,980円です",
      "玉島の冬、肩こり改善しませんか？",
      "玉島のおすすめ教えてください https://example.com",
    ];
    for (const t of bad) expect(checkAngle(LOCAL_TALK_ANGLE_ID, t).ok, t).toBe(false);
  });
  it("問いかけが無い・長すぎるものは落とす", () => {
    expect(checkAngle(LOCAL_TALK_ANGLE_ID, "玉島は今日も良い天気です。").ok).toBe(false);
    const long = "玉島の" + "あ".repeat(LOCAL_TALK.hardMax) + "ですか？";
    expect(checkAngle(LOCAL_TALK_ANGLE_ID, long).ok).toBe(false);
    expect(ANGLE_REQUIREMENTS.local_talk.maxChars).toBe(LOCAL_TALK.hardMax);
  });
  it("地名が入っていれば「この店を指す言葉」の検査も通る（店名は書かない回）", () => {
    const project = { storeName: "Moveact玉島店", area: "岡山県倉敷市玉島", localTerms: "新倉敷" };
    expect(identityTokens(project)).toContain("玉島");
    expect(checkIdentity(HAND_WRITTEN[0], project).ok).toBe(true);
  });
});

describe("地元の会話：プロンプト", () => {
  it("地名は登録の地域を市区町村に分け、道案内のような言葉は入れない", () => {
    expect(localTalkPlaces("岡山県倉敷市玉島", "新倉敷、JR新倉敷駅から車で約7分")).toEqual(["倉敷", "玉島", "新倉敷"]);
    expect(localTalkPlaces("なし", null)).toEqual([]);
    expect(localTalkPlaces("", "")).toEqual([]);
  });
  it("決まり（短い・地名1回・小さな質問で終える・宣伝なし・その日の出来事を言い切らない・絵文字はときどき）が入る", () => {
    const n = localTalkNote({ places: ["倉敷", "玉島"], allowEmoji: true });
    expect(n).toContain("自分が最近したことの報告"); // 2026-11-10 acc42 #6695「ついにコタツ出しちゃいました」
    for (const w of ["「倉敷」「玉島」", "20〜60字", "一言で答えられる", "国家資格", "な人へ", "その日の出来事", "ときどき", "1〜2個まで"]) expect(n, w).toContain(w);
    expect(n).not.toMatch(/https?:/);
    const plain = localTalkNote({ places: ["倉敷"], allowEmoji: false });
    expect(plain).toContain("絵文字は使わない");
    // 三上様の例文そのものは入れない（写されて同じ投稿が並ぶため）
    for (const t of OWNER_APPROVED) expect(n).not.toContain(t);
  });
});

describe("Moveact 玉島（acc10）は「マシン」を書かない", () => {
  const tamashima = {
    id: "p10", userId: 78,
    storeName: "Moveact玉島店",
    businessType: "マシンピラティススタジオ（整体・美容鍼併設）",
    area: "岡山県倉敷市玉島",
    strength: "マシンピラティス、マンツーマン、国家資格者",
    counselingResult: JSON.stringify({ menu: ["マシンピラティス50分", "整体"], brandVoice: "やわらかい敬語" }),
  };
  it("本文の検査：実際に出ていた2本は当たる。ほかのアカウントでは当たらない", () => {
    expect(findAccountBannedWord(10, "マシンがサポートするので大丈夫です")).toBe("マシン");
    expect(findAccountBannedWord(10, "マシンピラティスなら無理なく続けられますよ")).toBe("マシン");
    expect(findAccountBannedWord(10, "Machine Pilates")).toBe("Machine");
    expect(findAccountBannedWord(10, "玉島のそうめん、冬でも食べる派ですか？")).toBeNull();
    expect(findAccountBannedWord(12, "マシンピラティス")).toBeNull();
    expect(findAccountBannedWord(36, "マシン")).toBeNull();
    expect(bannedRuleFor(10)).not.toBeNull();
  });
  it("生成に渡す前に、お店の情報（業種・強み・はじめの設定）から外す（DBは変えない）", () => {
    const p = scrubProjectForAccount(10, tamashima);
    expect(p.businessType).toBe("ピラティススタジオ（整体・美容鍼併設）");
    expect(p.strength).toBe("ピラティス、マンツーマン、国家資格者");
    expect(JSON.parse(p.counselingResult).menu).toEqual(["ピラティス50分", "整体"]);
    expect(JSON.stringify(p)).not.toMatch(/マシン/);
    // 元の値は変えない
    expect(tamashima.businessType).toContain("マシン");
    // ほかのアカウントはそのまま
    expect(scrubProjectForAccount(12, tamashima)).toBe(tamashima);
  });
  it("プロンプトに禁止の指示が入る（acc10 だけ）", () => {
    expect(accountBannedNote(10)).toContain("マシン");
    expect(accountBannedNote(12)).toBe("");
  });
  it("Meta AI 呼びかけ投稿も、外した業種で作るので「マシン」が入らない", () => {
    const p = scrubProjectForAccount(10, tamashima);
    const t = buildMetaAiCallPostOfKind({ businessType: p.businessType, area: p.area }, "recommend")!;
    expect(t).toBe("@meta.ai 倉敷市玉島でピラティススタジオのおすすめを教えて");
    expect(findAccountBannedWord(10, t)).toBeNull();
  });
  it("全員に入る共通の指示のお手本から「マシンが支えてくれるピラティス」を外した", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "autoPostScheduler.ts"), "utf8");
    const addendum = src.slice(src.indexOf("const AUTO_POST_STYLE_ADDENDUM = `"), src.indexOf("const CONVERSATION_ENDING_ADDENDUM"));
    expect(addendum.length).toBeGreaterThan(100);
    expect(addendum).not.toMatch(/マシン/);
  });
  it("生成の最終検査と公開の直前の検査がつながっている", () => {
    const gen = fs.readFileSync(path.resolve(__dirname, "autoPostScheduler.ts"), "utf8");
    expect(gen).toContain("findAccountBannedWord(threadsAccountId, fullContent)");
    expect(gen).toContain("scrubProjectForAccount(threadsAccountId, project)");
    const exec = fs.readFileSync(path.resolve(__dirname, "scheduledPostExecutor.ts"), "utf8");
    expect(exec).toContain("findAccountBannedWord(account.id, post.postContent)");
  });
});

// ── 2026-11-21 夜間整備：地元の会話の回に「今日の主題」がぶつかる／同じ日に同じ話が2本 ──
describe("地元の会話：お店の主題とぶつけない・同じ話を続けない（2026-11-21）", () => {
  it("acc35 #7395 の文は「効果・結果の言い切り」として止まる（最後の作り直しでも公開しない側）", async () => {
    const { checkAngle } = await import("../shared/angleGuard");
    const r = checkAngle("local_talk", "岐阜市でコアレって知ってますか？\n寝てるだけでインナーマッスルに刺激が入るんですよ。\nウエスト引き締め効果も期待できます😊");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("効果・結果の言い切り");
    // ふつうの地元の会話は通る
    expect(checkAngle("local_talk", "金沢の冬といえば、コタツはもう出しましたか？").ok).toBe(true);
  });
  it("地元の会話の回は、今日の主題とネタ帳を渡さない（生成側の配線）", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "autoPostScheduler.ts"), "utf8");
    expect(src).toContain("if (localTalkTurn && plan.topic) {");
    expect(src).toContain("ft.buildFreshTopicNote(plan, { omitTopic: localTalkTurn })");
    expect(src).toContain("if (!opts.collect && !localTalkTurn) {");
    expect(src).toContain("recentTalks: recentLocalTalks(recentPosts)");
  });
  it("直近の地元の会話（短い・問いかけ）だけを拾う。お店の短い投稿は拾わない", async () => {
    const { recentLocalTalks } = await import("../shared/localTalk");
    const kotatsu = "岡山で「寒くなってきたね」って言うと「そろそろコタツ出す？」って返ってくるのは、あるあるだと思う。";
    const got = recentLocalTalks([
      kotatsu,
      "車検は、車検満了日の2か月前から受けられます。\n早く受けても次の満了日は短くなりません😊",
      "矢掛町にお住まいの方に聞きたいです。\n運転中、つい口ずさんでしまう曲ってありますか？",
      "当院では姿勢の検査を丁寧に行い、一人ひとりに合わせた計画をお伝えしています。".repeat(4) + "どう思いますか？",
    ]);
    expect(got).toEqual([kotatsu, "矢掛町にお住まいの方に聞きたいです。 運転中、つい口ずさんでしまう曲ってありますか？"]);
    expect(recentLocalTalks(null)).toEqual([]);
    // 問いかけの印が無い「〜よね」の形も拾う（acc34 #7381）
    expect(recentLocalTalks(["岐阜の冬、朝の車の窓が凍っています。\nお湯かけちゃダメって分かってても、急いでるとやっちゃいますよね😅"])).toHaveLength(1);
  });
  it("指示文に、直近の地元の会話と「名前を伏せた自分の答えを書かない」が入る", async () => {
    const { localTalkNote } = await import("../shared/localTalk");
    const note = localTalkNote({ places: ["岡山"], allowEmoji: true, recentTalks: ["岡山も朝晩は冷えるね。 コタツはもう出した？"] });
    expect(note).toContain("コタツはもう出した？");
    expect(note).toContain("同じ話をもう一度書かない");
    expect(note).toContain("私はあの角を曲がる時ですね");
    // 直近に無ければ足さない
    expect(localTalkNote({ places: ["岡山"], allowEmoji: true })).not.toContain("直近の「地元の会話」はこれ");
  });
});

describe('地元の会話：名前を伏せた言い方（2026-11-22 夜間整備）', () => {
  it('質問のあとの「私はあの〜です」の一文だけ落とす（公開された実例）', async () => {
    const { stripVagueSelfAnswer } = await import('../shared/localTalk');
    expect(stripVagueSelfAnswer('最近、夜が長くなりましたね。\n\nこの辺りだと、夜の散歩が気持ちいい場所ってどこでしょう？\n\n私はあの川沿いの道が好きです。'))
      .toBe('最近、夜が長くなりましたね。\n\nこの辺りだと、夜の散歩が気持ちいい場所ってどこでしょう？'); // #7438
    expect(stripVagueSelfAnswer('岡山って、冬支度何から始めますか？\n\n私はまず、あの温かい飲み物からですね。')).toBe('岡山って、冬支度何から始めますか？'); // #7444
    expect(stripVagueSelfAnswer('小田郡矢掛町で運転していると、思わず目を奪われる景色ってありますか？\n私はあの、夕焼けに染まる川沿いの道が好きです。'))
      .toBe('小田郡矢掛町で運転していると、思わず目を奪われる景色ってありますか？'); // #7447
    expect(stripVagueSelfAnswer('矢掛町にお住まいの方に聞きたいです。\n運転中、つい口ずさんでしまう曲ってありますか？\n私はやっぱり、あの懐かしいメロディですね。'))
      .toBe('矢掛町にお住まいの方に聞きたいです。\n運転中、つい口ずさんでしまう曲ってありますか？'); // #7387
    expect(stripVagueSelfAnswer('矢掛の道って、運転中につい「あるある」って思う瞬間ありませんか？\n私はあの角を曲がる時ですね。'))
      .toBe('矢掛の道って、運転中につい「あるある」って思う瞬間ありませんか？'); // #7389
  });
  it('「私はやっぱり、アレですね。」も落とす（11/22 の試し生成で出た形）', async () => {
    const { stripVagueSelfAnswer } = await import('../shared/localTalk');
    expect(stripVagueSelfAnswer('金沢の冬の運転で、これは欠かせない！ってものありますか？\n\n私はやっぱり、アレですね。'))
      .toBe('金沢の冬の運転で、これは欠かせない！ってものありますか？');
  });
  it('名前を言っている文・前の文を指す「あの」は変えない', async () => {
    const { stripVagueSelfAnswer, findVagueName } = await import('../shared/localTalk');
    for (const t of [
      '鴨方のそうめん、冬でも食べる派ですか？笑\n私はにゅうめん派です。',
      '神崎本宿で、最近よく見かけるのが金木犀の香り。\nあの香りがすると、秋だなぁって感じますよねー！\n皆さんはどんな秋の匂いが好きですか？😊', // #4478
      '下総神崎駅前のイチョウ並木、見頃になってきましたね。\nあの黄色を見ると、今年もあと少しって感じがします🍂\n\n皆さんはどんな時に秋の終わりを感じますか？', // #6492
      '金沢の冬といえば、やっぱりアレですよね。\n\nおでんの具に「バイ貝」は欠かせない派ですか？', // #7415 後で名前を言う
      '金沢の秋といえば、やっぱりアレですよね。\n\n香箱ガニ、もう食べましたか？\n\n今年はいつ頃行きますか？', // #7114
      '岐阜市でコアレって知ってますか？', // 「コアレ」の中の「アレ」は数えない
      '花粉のアレルギー、春と秋どっちがつらい派ですか？',
      '岐阜の秋といえば、やっぱり栗きんとんが食べたくなります。\nみなさんは、どこのお店の栗きんとんが好きですか？', // #7455
    ]) {
      expect(stripVagueSelfAnswer(t), t).toBe(t);
      expect(findVagueName(t), t).toBeNull();
    }
  });
  it('落とすと問いかけが残らないときは触らない', async () => {
    const { stripVagueSelfAnswer } = await import('../shared/localTalk');
    const t = '私はあの川沿いの道が好きです。';
    expect(stripVagueSelfAnswer(t)).toBe(t);
  });
  it('文の中心が伏せてあるものは作り直しの理由にする（公開された実例）', async () => {
    const { findVagueName, vagueNameRetryHint } = await import('../shared/localTalk');
    expect(findVagueName('金沢はもうすぐ冬の足音。\nあの、雪が降る前にやるアレ、もう済ませましたか？')).not.toBeNull(); // #7412
    expect(findVagueName('廿日市で運転してると、ついあの道の横道に吸い込まれそうになりません？\n\n私だけかな。')).not.toBeNull(); // #7425
    expect(findVagueName('あの橋からの眺め、昼と夜どっちが好きですか？私、迷っちゃいますね。')).not.toBeNull(); // #6411
    expect(findVagueName('秋の夕暮れ、あの川沿いを歩くのが好きです。風が冷たいけど、空の色が綺麗で！\n皆さんは、秋の散歩、どこがお気に入りですか？')).not.toBeNull(); // #6624
    expect(vagueNameRetryHint('あの道')).toContain('あの道');
  });
});

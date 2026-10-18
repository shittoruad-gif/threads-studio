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
  it("割合は1つの定数（LOCAL_TALK.share）で、4〜5本に1本", () => {
    expect(LOCAL_TALK.share).toBeGreaterThanOrEqual(0.2);
    expect(LOCAL_TALK.share).toBeLessThanOrEqual(0.25);
    const s = shareOf(4000);
    expect(s).toBeGreaterThan(LOCAL_TALK.share - 0.03);
    expect(s).toBeLessThan(LOCAL_TALK.share + 0.03);
  });
  it("ほかの切り口の実績・試験の型・希望の型があっても割合は変わらない", () => {
    const s = shareOf(4000, { studyExperiment: true, preferredAngles: ["pro_tip"], recentAngles: ["aruaru", "aruaru", "aruaru"] });
    expect(s).toBeGreaterThan(LOCAL_TALK.share - 0.03);
    expect(s).toBeLessThan(LOCAL_TALK.share + 0.03);
  });
  it("✕が多いと下がり、◯が多いと上がる（上限 0.4）", () => {
    expect(shareOf(3000, {}, { local_talk: { good: 0, bad: 2 } })).toBeLessThan(0.05);
    const up = shareOf(3000, {}, { local_talk: { good: 5, bad: 0 } });
    expect(up).toBeGreaterThan(0.35);
    expect(up).toBeLessThan(0.45);
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

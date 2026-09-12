import { describe, it, expect } from "vitest";
import { generateThreadsPrompt } from "../shared/threadsPrompts";
import { findBannedTic, checkNaturalized } from "../shared/jpQualityGuard";

/**
 * 固定投稿のプロンプトに、実測ノウハウ（POST_TYPE_SUPPLEMENTS.pinned）が
 * 必ず入ることの確認。定義だけあって配線されておらず、固定投稿が
 * ノウハウ無視の内容で出ていた（2026-09-02検出）ことへの再発防止。
 */
const BASE = {
  postType: "pinned" as const,
  purpose: "cv" as const,
  storeName: "テスト整体院",
  businessType: "整体院",
  area: "岡山市北区",
  target: "肩こりの30代女性",
  mainProblem: "慢性肩こり",
  strength: "国家資格者",
  links: [{ type: "line", label: "公式LINE", url: "https://lin.ee/x" }],
  useThreadsKnowhow: true,
};

describe("固定投稿プロンプトのノウハウ反映", () => {
  const prompt = generateThreadsPrompt({
    ...BASE,
    counseling: { brandVoice: "やわらかい敬語", menu: ["整体60分"] },
    ngWords: ["根本改善"],
  } as any);

  it("構成ルールと長さの制約が入る", () => {
    expect(prompt).toContain("固定投稿（プロフィール固定用）の構成ルール");
    expect(prompt).toContain("400〜470文字");
    expect(prompt).toContain("合計を必ず495文字以内");
    expect(prompt).toContain("50字ルールは適用しない");
    // 住所・免責の羅列で埋める暴走の禁止（氷見様データで528字のctaが出た）
    expect(prompt).toContain("免責・注意書きの列挙");
    expect(prompt).toContain("コメント欄への誘導1行だけ");
  });

  /**
   * 2026-09-03: 三上さんが手直しした玉島店の固定投稿を「この品質で作れるように」
   * とのご指示。その投稿の骨格（思い込みの否定→入力済みの事実で裏づけ→
   * お客様の言葉→断る自由を渡す締め）をプロンプトに落とし込んだ。
   */
  it("承認された固定投稿の骨格が指示に入る", () => {
    expect(prompt).toContain("世間で信じられていることを1つ");
    expect(prompt).toContain("入力済みの事実だけ");
    expect(prompt).toContain("来店する前」に口にする言葉");
    // 実在しない「お客様の声」を作らせない（体験後の感想は使わせない）
    expect(prompt).toContain("施術後の感想・成果の声");
    expect(prompt).toContain("断る自由を明示");
  });

  /**
   * 旧プロンプトは「○○で悩んでませんか？」で始めろ・「実は私も○○でした」と
   * 書け・悩みを箇条書きにしろ、と指示していた。いずれも
   * jpQualityGuard の禁止事項や業種インサイトの負け筋と正面から矛盾していた。
   */
  it("ガードや実測と矛盾する指示を出さない", () => {
    const ng = prompt.slice(prompt.indexOf("書いてはいけないもの"));
    // かつては「〜で悩んでませんか？」で始めろ・「実は私も」と書け、が"指示"だった。
    // いまはどちらも禁止側にだけ登場すること。
    expect(ng).toContain("実は私も");
    expect(prompt.slice(0, prompt.indexOf("書いてはいけないもの"))).not.toContain("実は私も");
    expect(prompt).toContain("同意を求める確認疑問");
    expect(prompt).toContain("「〜な人へ」という呼びかけで始めない");
    expect(prompt).toContain("担当者の資格を勝手に書かない");
  });

  it("URLは本文でなくコメント欄へ誘導する指示が入る", () => {
    expect(prompt).toContain("コメント欄のリンクから");
    expect(prompt).toContain("生のURL");
  });

  it("カウンセリング結果とNGワードが入る", () => {
    expect(prompt).toContain("やわらかい敬語");
    expect(prompt).toContain("根本改善");
  });

  it("通常投稿のプロンプトには固定投稿の構成ルールを混ぜない", () => {
    const daily = generateThreadsPrompt({
      postType: "empathy",
      businessType: "整体院",
      area: "岡山",
      target: "x",
      mainProblem: "y",
      strength: "z",
    } as any);
    expect(daily).not.toContain("固定投稿（プロフィール固定用）の構成ルール");
  });
});

/**
 * 2026-09-13 夜間整備。固定投稿の生成には、毎日の投稿にかけている品質検査が
 * 1つもかかっていなかった（server/pinnedPostFlow.ts に findBannedTic も checkNaturalized も無かった）。
 * ローカルQAでその場で作った1本目に、実際に「諦めていませんか？」が入っていた。
 * 固定投稿はプロフィールの一番上に置きっぱなしになる、いちばん人目に触れる投稿なので、
 * 同じものが出たら必ず作り直しになるよう、実物を置いておく。
 */
describe("固定投稿にも毎日の投稿と同じ品質検査をかける（2026-09-13）", () => {
  const 実際に出た下書き =
    "岡山県倉敷市玉島で「朝、腰が重くてなかなか起き上がれない」と感じている方へ。\n\n" +
    "朝の腰の重さは、年のせいだとか、寝不足のせいだと諦めていませんか？日中の体の使い方が大きく影響していることが多いんです。\n\n" +
    "当院では、初回に30分かけてカウンセリング。お客様一人ひとりの体の使い方を丁寧に説明し、ご自身の体と向き合うきっかけを見つけていただけます。";

  it("決まり文句「いませんか？」を見つける（これが作り直しの合図になる）", () => {
    expect(findBannedTic(実際に出た下書き)).toBe("いませんか？");
    expect(checkNaturalized(実際に出た下書き, 実際に出た下書き, { allowQuestionEnding: true }).ok).toBe(false);
  });

  it("作り直したあとの実物（決まり文句なし）は通す＝誤って止め続けない", () => {
    const 直った =
      "倉敷市玉島で「朝、腰が重くてベッドから起き上がるのがつらい」と感じる方へ。\n\n" +
      "その腰の重さは、もしかしたら寝ている間の姿勢や、日中のデスクワークでの体の使い方に原因があるかもしれません。\n\n" +
      "初回に30分かけてあなたの体の使い方を丁寧にカウンセリングし、根本から整えるお手伝いをしています。";
    expect(findBannedTic(直った)).toBeNull();
    expect(checkNaturalized(直った, 直った, { allowQuestionEnding: true }).ok).toBe(true);
  });
});

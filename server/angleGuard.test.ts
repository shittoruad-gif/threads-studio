import { describe, it, expect } from "vitest";
import { checkAngle, isDefaultTemplate, angleRetryHint, ANGLE_REQUIREMENTS } from "../shared/angleGuard";
import { POST_ANGLES, PERSONAL_EXTRA_ANGLES } from "../shared/postAngles";

/**
 * 2026-09-18 三上様「いろいろなパターンを試せるのが売りなのに、最近の投稿は無難なものばかり」。
 * 切り口の選択は分散しているのに、出来上がりが同じ型に潰れていた。
 * 本番の実データ（三上様のアカウント・直近6本）をそのまま固定し、
 * 「切り口が守られていない投稿を落とし、守られている投稿は通す」ことを確かめる。
 */
describe("切り口が守られたかの検査（本番の実データで）", () => {
  // 切り口が違うのに全部「悩み一言→店名→国家資格者が整えます」だった6本
  const 三上様の実例 = [
    { id: 1584, angle: "lesson", text: "運動が続かないと感じる方へ。\n\n倉敷市にあるMoveact玉島店です。\n\n国家資格者が、マシンピラティスで無理なく体を整えます😊\n\n続けることで、朝の軽さや姿勢の変化を実感できます。" },
    { id: 1577, angle: "surprise_fact", text: "肩こり、揉むだけでは戻ります。\n\n本当の原因は姿勢にあることがほとんどです。\n\n浅口市Moveact金光店では、国家資格者が丁寧に体の状態を整えます😊" },
    { id: 1574, angle: "personality", text: "夜まで頑張るあなたへ。\n\n「疲れ」と諦めがちです。\n\nMoveact金光店は夜21時まで開いています。\n\n仕事帰りでも、気軽に体を整えに来てくださいね😊" },
    { id: 1570, angle: "lesson", text: "金光町で「すぐ戻る」姿勢の悩み、よく聞く声です。\n\nMoveact金光店。国家資格者が根本原因を確認します。\n\n金光駅から徒歩6分。あなたに合わせたアプローチをご提案。\n\nどんな時に猫背が気になりますか？😊" },
  ];

  it("#1584 学びの回に「気づき」が無い → 落とす（定型に戻っている）", () => {
    const r = checkAngle("lesson", 三上様の実例[0].text);
    expect(r.ok).toBe(false);
    expect(r.defaultTemplate).toBe(true);
  });

  it("#1577 意外な事実の印（戻ります・本当の原因）はあるが、定型に戻っている → 落とす", () => {
    const r = checkAngle("surprise_fact", 三上様の実例[1].text);
    expect(r.ok).toBe(false);
    expect(r.defaultTemplate).toBe(true);
    expect(r.reason).toMatch(/定型/);
  });

  it("印があり、定型でもない意外な事実は通す", () => {
    expect(checkAngle("surprise_fact", "猫背って、筋トレだけでは整わないこと、知ってましたか？\n\n土台から見直すのが近道なんです。").ok).toBe(true);
  });

  it("#1574 人柄の回に営業時間と来店の案内 → 落とす", () => {
    const r = checkAngle("personality", 三上様の実例[2].text);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/売り込み/);
  });

  it("#1570 学びの回に学びが無く、徒歩◯分の案内 → 落とす", () => {
    expect(checkAngle("lesson", 三上様の実例[3].text).ok).toBe(false);
  });

  it("定型の判定：店名＋国家資格＋「整えます」の短文は定型", () => {
    expect(isDefaultTemplate(三上様の実例[0].text)).toBe(true);
    expect(isDefaultTemplate("昔は一人で黙々とゲームしてたんです。\nランクも上がったけど、どこか物足りなくて。\n珠由良族を始めて、みんなとワイワイやる楽しさを知りました！")).toBe(false);
  });
});

describe("切り口ごとの要件（守られている投稿は通す）", () => {
  it.each([
    ["aruaru", "デスクワーク中、気づけば背中が丸まってる！\n\nこれ、倉敷市でよく聞くお悩みです😅"],
    ["customer_voice", "お客様が『旅行に行けるようになった！』と笑顔に😊\n\nその報告が、私にとって何より嬉しいんです。"],
    ["behind_scenes", "うちがマシンにこだわる理由。\n\n動きを支えてくれるから、体が硬くても始められるんです。"],
    ["misconception", "「私には無理」って思っていませんか？\n\n実は、体が硬い人ほど変化を感じやすいんです。"],
    ["qa", "「何回くらい通えばいい？」\n\nこの質問、正直いちばん多いです。3ヶ月を目安に変化を感じる方が多いですよ。"],
    ["seasonal", "秋になると腰が重い、という声が増えます。\n\n朝晩の冷えで体がこわばりやすい時期です。"],
    ["local", "金光駅から徒歩6分。\n\n仕事帰りに寄れる距離です。"],
    ["change_story", "以前は階段がつらかった方が、今では旅行に行けるようになりました。"],
    ["personality", "休日は近所の川沿いを歩くのが好きです。\n\n体を動かす気持ちよさを、自分でも忘れないように😊"],
    ["lesson", "続かないのは根性の問題じゃないと、やっと分かりました。\n\n仕組みで続ける方が大事だと気づいた話。"],
    ["pro_tip", "デスクで1時間に1回、10秒だけ肩を回す。\n\nこれだけで夕方の重さが違うと言われています。"],
    ["surprise_fact", "猫背って、筋トレだけでは整わないこと、知ってましたか？"],
    ["reassurance", "SNS投稿が続かないのは、あなたのせいじゃないんです。\n\n手動で毎日やるのは大変すぎます。"],
    ["failure_story", "倉敷市でコンサルを始めた頃。\n\n集客は試行錯誤の連続でした。"],
    ["number_result", "3ヶ月で姿勢が変わる方が多いです。\n\n倉敷市玉島で、国家資格者がサポート。"],
  ])("%s：要件を満たす本文は通す", (angle, text) => {
    expect(checkAngle(angle, text).ok).toBe(true);
  });

  it.each([
    ["lesson", "猫背で悩む人が知らないこと、3つあります。\n\n呼吸が浅い、お腹の力が抜けている、背中が硬い。"],
    ["personality", "運動が続かない人の共通点、3つあります。\n\n初回体験のご相談は、プロフィールのリンクから。"],
    ["customer_voice", "店舗集客の悩み、3つありませんか？🤔\n\nこれ、実は全部解決できるんです！"],
    ["number_result", "岡山県の店舗オーナーさん、集客の悩みって共通点が多いですよね。"],
    ["local", "岡山県内の店舗オーナーさん、集客の悩み、ありませんか？"],
    ["qa", "90代の方も安心。触れるだけの整体です。\n\n滑川市で30年、多くの方に喜ばれています。"],
    ["change_story", "猫背に悩む30〜50代女性の共通点、3つあるんです！\n\n放置、自己流、プロ不在。"],
  ])("%s：要件を満たさない本文は落とす（本番で実際に出ていた文）", (angle, text) => {
    expect(checkAngle(angle, text).ok).toBe(false);
  });

  it("要件を定義していない切り口（悩み深掘り・予約導線・Meta AI）は検査しない", () => {
    for (const id of ["deep_worry", "reservation_funnel", "meta_ai_call", "quote_pinned"]) {
      expect(checkAngle(id, "何でもよい文").ok).toBe(true);
    }
    expect(checkAngle(null, "何でもよい文").ok).toBe(true);
  });

  it("回転に入っている切り口は、悩み深掘り・予約導線を除きすべて要件を持つ", () => {
    const rotating = [...POST_ANGLES, ...PERSONAL_EXTRA_ANGLES].map((a) => a.id).filter((id) => !["deep_worry", "reservation_funnel"].includes(id));
    for (const id of rotating) expect(ANGLE_REQUIREMENTS[id], id).toBeTruthy();
  });

  it("作り直しの指示に、切り口の名前と定型禁止が入る", () => {
    const r = checkAngle("personality", "Moveact金光店は夜21時まで開いています。国家資格者が整えます。");
    const hint = angleRetryHint(r, "人柄・日常");
    expect(hint).toContain("人柄・日常");
    expect(hint).toContain("定型");
    expect(hint).toContain("営業時間");
  });
});

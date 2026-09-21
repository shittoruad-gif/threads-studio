import { describe, it, expect } from "vitest";
import { nextZeroPostDays, canAskForMaterial, ZERO_POST_DAYS_TO_ASK, MATERIAL_ASK_INTERVAL_DAYS } from "./zeroPostApology";
import { zeroPostApologyNotice } from "../shared/materialDepth";

/**
 * 2日続けて投稿が1本も届かなかったら、お詫びして追加情報をお願いする（2026-09-21 三上様指示）。
 *
 * 香取様（acc21・light_campaign・1日1件）は材料が尽きて毎回同じ言い回しに戻り、
 * 9/20・9/21 と2日続けて投稿が1本も作れなかった。黙って翌日へ回していたため、
 * お客様からは「投稿が来ていません」というお問い合わせになっていた（9/10 に続き2度目）。
 */

// 香取様のお店の情報（本番の実データ）
const KATORI = {
  businessType: "整骨院・接骨院",
  area: "茨城県土浦市神立中央1丁目",
  storeName: "神立宏友会シン接骨院",
  target: "スポーツをする学生\n慢性の腰痛、膝痛、首肩の痛みのある方\n交通事故の治療を受けたい方",
  mainProblem: "スポーツによる腰痛や膝の痛み、ケガ（捻挫、肉離れ、突き指）\n慢性的な腰痛、膝痛、首肩の痛み\n交通事故後の身体の痛み",
  strength: "スポーツのケガに強い、夜２１時まで営業、院長の経験豊富、交通事故治療と対応に強い",
  usp: "外傷専門特化",
  proof: "整形外科で11年勤務\n学会で11年連続で発表",
  n1Customer: "小学生が足を捻って我慢していたが\n当院に来てエコー観察したら骨折があった",
  belief: "痛い場所をマッサージするだけでは良くなりません。\n昔はマッサージばかりやっていた。",
  customerWords: null,   // 空欄
  catchphrase: null,     // 空欄
  localTerms: null,      // 空欄
};

describe("連続ゼロの数え方", () => {
  it("1件でも作れたら0に戻す", () => {
    expect(nextZeroPostDays({ zeroPostDays: 5, zeroPostDate: "2026-09-20" }, 1, "2026-09-21", "2026-09-20")).toBe(0);
  });

  it("昨日もゼロなら1日ずつ増える", () => {
    expect(nextZeroPostDays({ zeroPostDays: 1, zeroPostDate: "2026-09-20" }, 0, "2026-09-21", "2026-09-20")).toBe(2);
  });

  it("間が空いていたら1から数え直す（3日前にゼロでも連続とは言わない）", () => {
    expect(nextZeroPostDays({ zeroPostDays: 4, zeroPostDate: "2026-09-18" }, 0, "2026-09-21", "2026-09-20")).toBe(1);
  });

  it("初めてのゼロは1日目", () => {
    expect(nextZeroPostDays({ zeroPostDays: 0, zeroPostDate: null }, 0, "2026-09-21", "2026-09-20")).toBe(1);
  });

  it("同じ日に2回通っても二重に足さない（当日補充のあとなど）", () => {
    expect(nextZeroPostDays({ zeroPostDays: 2, zeroPostDate: "2026-09-21" }, 0, "2026-09-21", "2026-09-20")).toBe(2);
  });

  it("2日続いたらお願いの対象になる", () => {
    const days = nextZeroPostDays({ zeroPostDays: 1, zeroPostDate: "2026-09-20" }, 0, "2026-09-21", "2026-09-20");
    expect(days).toBeGreaterThanOrEqual(ZERO_POST_DAYS_TO_ASK);
  });
});

describe("お願いは繰り返さない", () => {
  const now = Date.parse("2026-09-21T06:00:00+09:00");
  it("一度も送っていなければ送る", () => {
    expect(canAskForMaterial({ materialAskedAt: null }, now)).toBe(true);
  });
  it("昨日送っていたら送らない（毎朝の督促にしない）", () => {
    expect(canAskForMaterial({ materialAskedAt: new Date(now - 86400000) }, now)).toBe(false);
  });
  it("7日たてばまた送る", () => {
    expect(canAskForMaterial({ materialAskedAt: new Date(now - (MATERIAL_ASK_INTERVAL_DAYS + 1) * 86400000) }, now)).toBe(true);
  });
});

describe("お詫びとお願いの文面（香取様の実データ）", () => {
  const n = zeroPostApologyNotice("shin_honetugi", KATORI, 2, 2);

  it("お詫びと、何日・何件届かなかったかを最初に書く", () => {
    expect(n.text).toContain("2日続けてお届けできていません");
    expect(n.text).toContain("2件");
    expect(n.text).toContain("申し訳ございません");
  });

  it("原因をこちら側の言葉で説明し、お客様を責めない", () => {
    expect(n.text).toContain("前と同じ言い回しに戻ってしまう");
    expect(n.text).not.toContain("ご登録が足りない");
  });

  it("空欄の項目を名指しでお願いする（お客様の言葉・決め台詞・地元の言葉）", () => {
    expect(n.askedKeys.length).toBeGreaterThan(0);
    expect(n.askedKeys.length).toBeLessThanOrEqual(3);
    // 香取様は customerWords・catchphrase・localTerms が空欄。効く順に上から選ばれる
    expect(n.askedKeys).toContain("customerWords");
  });

  it("そのままトークに送れば反映されると伝える", () => {
    expect(n.text).toContain("このトークに、そのまま文章で送っていただくだけ");
    expect(n.text).toContain("はじめの設定」をやり直していただく必要はありません");
  });

  it("届かなかった分をお詫びとして必ず返すと約束する", () => {
    expect(n.text).toContain("お詫びとして");
    expect(n.text).toContain("1日1件ずつ");
  });

  it("LINEで読めない記号で飾らない", () => {
    expect(n.text).not.toContain("**");
    expect(n.text).not.toMatch(/[#｜]/);
  });
});

describe("冷却中は「いつから補填するか」を正しく伝える（2026-09-21）", () => {
  it("冷却中は『◯月◯日以降に』と書く（冷却明けの翌日から補填が乗るため）", () => {
    const n = zeroPostApologyNotice("shin_honetugi", KATORI, 2, 5, "9月26日");
    expect(n.text).toContain("9月26日以降に1日1件ずつ");
    expect(n.text).toContain("1日1件に抑えている期間");
    expect(n.text).not.toContain("これから1日1件ずつ");
  });

  it("冷却中でなければ今までどおり「これから」", () => {
    const n = zeroPostApologyNotice("shin_honetugi", KATORI, 2, 2, null);
    expect(n.text).toContain("これから1日1件ずつ");
    expect(n.text).not.toContain("以降に1日1件ずつ");
  });
});

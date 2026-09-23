/**
 * オーナーが続けて見送った投稿から共通点を取り出す仕組みの番人（2026-09-24 三上様指示）。
 *
 * 香取様（acc21）の見送り10本と同じ「くり返しの形」を、架空のお店で再現してある（公開リポジトリのため実データは入れない）。
 * 9/23 に3案が3案とも見送られたのは、どれも「揉むだけでは根本は変わりません」「11年」で、
 * 信条・実績・文体のお手本に書かれた主張をAIが写していたため。
 */
import { describe, it, expect } from "vitest";
import {
  extractDeclinedPatterns, touchesDeclined, filterStyleSamples, buildDeclinedNote,
  protectTokensOf, filterCounseling, SKIP_REASONS, SKIP_REASON_QUESTION, skipReasonThanks, isSkipReasonCode,
} from "@shared/declinedPatterns";

// ★このリポジトリは公開なので、お客様の実際の投稿・住所・ご登録内容は入れない。
//   香取様（acc21）の見送り10本と同じ「くり返しの形」を、架空のお店で再現してある
//   （決め数字「11年」7本／「痛い場所だけ揉んでも」系／「根本は変わりません」／
//    「昔の私もマッサージばかり」／「あなたの腰痛」で締める問いかけ）。
const DECLINED: string[] = [
  "長く座ると腰が重い。これ、よく聞くお悩みです。\n接骨院で11年働いた経験から、原因を探します。\n船橋市本町で、朝までぐっすりの毎日へ。\nあなたの腰痛、どんな時に辛いですか？",
  "「痛い場所だけ揉んでも…」そう思ってませんか？\n船橋市で11年、多くの腰痛を見てきました。\n当院はケガの経験から、原因を探ることにこだわっています。\nあなたの腰痛、何に困っていますか？",
  "その腰痛、揉むだけでは根本は変わりません。\n昔の私もマッサージばかりしていました。\n船橋市で11年、多くのケースを見て気づいたことです。\nあなたの腰痛、本当の原因は何だと思いますか？",
  "平日は20時まで受付しております。\n仕事帰りでも間に合います。\n船橋市本町、予約優先制です。",
  "「背中を反らすと痛い」という方がいます。\n実は腰だけの問題ではないことも多いです。\n腰だけを揉んでも戻りやすいのは、そのためです。",
  "寝違えた首、朝どうしてますか？\n枕の高さで楽になる方もいます。\n首のカーブに合う高さが大切です。",
  "船橋市本町で、その腰痛は諦めなくていいです。\n痛い場所だけ揉んでも、一時的になりがちです。\n昔の私もマッサージばかりしていました。",
  "整形外科で11年勤務して分かった、ケガで一番大切なこと。\n痛む場所だけでなく、原因を見つけることです。",
  "千葉県船橋市でスポーツのケガを見て11年。\n痛む場所だけ触っても、根本は変わりません。\n昔は私もマッサージばかりしていたんです。",
  "整形外科で11年勤務していました。\n痛い場所だけ揉んでも、根本は変わりません。\nケガで悩んで、本当に困ったことはありますか？",
];
const PROJECT = {
  storeName: "サンプル整骨院",
  area: "千葉県船橋市本町1丁目",
  localTerms: null as string | null,
  belief: "痛い場所をマッサージするだけでは良くなりません。\n昔はマッサージばかりやっていた。",
  proof: "整形外科で11年勤務\n学会で11年連続で発表",
  styleSamples: [
    "腰痛でマッサージを受けている方、悪いわけではないが、マッサージだけでは腰痛は良くなりません。",
    "腰の骨　腰椎は捻る機能はほとんどありません。\n身体を捻る動きでは胸、背中、股関節が重要になります。",
    "日本人の約80%が一生に一度は腰痛を経験しているようです。\nあなたは80%に入ってますか？",
  ].join("\n---\n"),
};
const PROTECT = [PROJECT.storeName, PROJECT.area, PROJECT.localTerms];

describe("見送られた投稿の共通点（香取様と同じ形の架空データ）", () => {
  const pt = extractDeclinedPatterns(DECLINED, PROTECT);

  it("何度も出ている決め数字と言い回しを拾う", () => {
    expect(pt.top).toContain("11年");
    expect(pt.top.some((p) => p.includes("痛い場所だけ揉んでも"))).toBe(true);
    expect(pt.top.some((p) => p.includes("根本は変わりません"))).toBe(true);
    expect(pt.top.some((p) => p.includes("マッサージばかり"))).toBe(true);
  });

  it("地名・店名は拾わない（この店らしさの必須条件を壊さない）", () => {
    for (const p of pt.top) {
      expect(p).not.toContain("船橋");
      expect(p).not.toContain("本町");
    }
  });

  it("切れ端（「場所だけ」など）を代表に出さない", () => {
    expect(pt.top).not.toContain("場所だけ");
    expect(pt.top).not.toContain("で11年");
  });

  it("信条・実績は、共通点に触れる行がすべて外れる", () => {
    for (const line of String(PROJECT.belief).split(/\n/).filter((l) => l.trim())) {
      expect(touchesDeclined(line, pt), line).toBe(true);
    }
    for (const line of String(PROJECT.proof).split(/\n/).filter((l) => l.trim())) {
      expect(touchesDeclined(line, pt), line).toBe(true);
    }
  });

  it("文体のお手本は「マッサージだけでは良くなりません」の文だけ外し、口調の見本は残す", () => {
    const f = filterStyleSamples(PROJECT.styleSamples, pt);
    expect(f).not.toContain("マッサージだけでは腰痛は良くなりません");
    // ご本人らしい解説の文（主張を写されても困らない、口調の見本）は残る
    expect(f).toContain("腰椎は捻る機能はほとんどありません");
    expect(f).toContain("80%");
  });

  it("「長音（ー）」で言葉が切れない（マッサージを拾えていなかった不具合の番人）", () => {
    expect(pt.all.some((p) => p.includes("マッサージ"))).toBe(true);
  });
});

describe("はじめの設定の答えからも外す（2026-09-24 追加）", () => {
  const pt = extractDeclinedPatterns(DECLINED, PROTECT);
  it("業界の誤解・実績に入っている同じ主張を外し、ほかの項目は残す", () => {
    const cr = {
      industryMyths: ["痛い場所をマッサージするだけでは良くなりません。", "昔はマッサージばかりやっていた。"],
      realProofs: ["整形外科で11年勤務", "学会で11年連続で発表"],
      realEpisodes: ["小学生が足を捻って我慢していたが、エコーで骨折が見つかった"],
      faq: ["予約が必要ですか？"],
      brandVoice: "ですます調",
    };
    const r = filterCounseling(cr, pt);
    expect(r.value.industryMyths).toEqual([]);
    expect(r.value.realProofs).toEqual([]);
    expect(r.value.realEpisodes).toHaveLength(1);
    expect(r.value.faq).toHaveLength(1);
    expect(r.value.brandVoice).toBe("ですます調");
    expect(r.dropped).toBe(4);
  });
  it("見送りが無ければ何も変えない", () => {
    const cr = { realProofs: ["整形外科で11年勤務"] };
    expect(filterCounseling(cr, null).value).toBe(cr);
  });
});

describe("お店の主題は避けない", () => {
  it("強みに登録した言葉（スポーツのケガ）は、見送りに何度出ても禁止にしない", () => {
    const declined = [
      "スポーツのケガ、我慢していませんか。整形外科で11年、見てきました。",
      "スポーツのケガは早めが大切です。整形外科で11年の経験があります。",
      "部活のスポーツのケガ。整形外科で11年勤めて分かったことがあります。",
    ];
    const pt = extractDeclinedPatterns(declined, ["サンプル整骨院"], { topics: ["スポーツのケガに強い、夜21時まで営業"] });
    expect(pt.top.join()).not.toContain("スポーツのケガ");
    // 実績から来た決め数字は、主題ではないので避ける対象のまま
    expect(pt.top).toContain("11年");
  });
});

describe("誤って効きすぎない", () => {
  it("見送りが1本だけなら何も拾わない（たまたまの一致で禁止にしない）", () => {
    expect(extractDeclinedPatterns([DECLINED[0]], PROTECT).top).toEqual([]);
  });

  it("中身がばらばらな見送りからは、ふつうの言葉を拾わない", () => {
    const pt = extractDeclinedPatterns([
      "朝晩が冷えてきました。首元を温めるだけで肩が軽くなる方もいます。",
      "今日は駐車場のご案内です。お店の前に2台分あります。",
      "スタッフの趣味は釣りです。先週は大きな鯛が釣れたそうです。",
    ], ["テスト整骨院"]);
    expect(pt.top).toEqual([]);
  });

  it("住所を市区町村ごとに分けて守る", () => {
    const t = protectTokensOf(["千葉県船橋市本町1丁目"]);
    expect(t).toContain("船橋市");
    expect(t).toContain("千葉県");
    expect(t).toContain("本町");
  });
});

describe("プロンプトに足す指示", () => {
  const pt = extractDeclinedPatterns(DECLINED, PROTECT);

  it("共通点を「使わない・言い換えも不可」として書く", () => {
    const note = buildDeclinedNote({ patterns: pt, reasons: [] });
    expect(note).toContain("オーナーが続けて見送った投稿");
    expect(note).toContain("「11年」");
    expect(note).toContain("言い換えて同じことを言うのも不可");
  });

  it("お聞きした理由（文章）は、いちばん優先として原文のまま入れる", () => {
    const note = buildDeclinedNote({ patterns: pt, reasons: [{ reason: "text", reasonText: "マッサージを否定する言い方はしたくない" }] });
    expect(note).toContain("オーナーの言葉（いちばん優先して守る）：「マッサージを否定する言い方はしたくない」");
  });

  it("ボタンの理由は、それぞれの指示に置き換える", () => {
    const note = buildDeclinedNote({ patterns: { top: [], all: [], sampleSize: 0 }, reasons: [{ reason: "claim" }, { reason: "tone" }] });
    expect(note).toContain("言っていることが違う");
    expect(note).toContain("口調・言い回しが違う");
  });

  it("共通点も理由も無ければ何も足さない（ふつうのお客様の生成は変わらない）", () => {
    expect(buildDeclinedNote({ patterns: { top: [], all: [], sampleSize: 0 }, reasons: [] })).toBe("");
  });
});

describe("理由をお聞きするボタン", () => {
  it("LINEのクイックリプライの文字数（20字）に収まる", () => {
    for (const [code, r] of Object.entries(SKIP_REASONS)) {
      expect(Array.from(r.label).length, code).toBeLessThanOrEqual(20);
    }
  });

  it("押さなくてもよいことを添えて、お詫びは入れない", () => {
    expect(SKIP_REASON_QUESTION).toContain("押さなくても大丈夫");
    expect(SKIP_REASON_QUESTION).not.toMatch(/申し訳|お詫び|すみません/);
  });

  it("「今日は出したくないだけ」は中身の問題として扱わない", () => {
    expect(SKIP_REASONS.today.note).toBe("");
    expect(skipReasonThanks("today")).toContain("内容の問題ではない");
  });

  it("知らない理由の値は受け付けない", () => {
    expect(isSkipReasonCode("same")).toBe(true);
    expect(isSkipReasonCode("drop table")).toBe(false);
  });
});

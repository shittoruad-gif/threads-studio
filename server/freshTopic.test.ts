/**
 * 「同じような内容ばかり」を話題の単位で止める仕組みの番人（2026-09-25 三上様指示）。
 *
 * ★このリポジトリは公開なので、お客様の実際の投稿・ご登録内容は入れない。
 *   9/24〜9/25 に「同じような内容ばかり」で4回見送られた求人アカウントと同じ「くり返しの形」
 *   （未経験で不安→先輩も最初は不安→役職に→スタッフが優しい）を、架空のサロンで再現してある。
 */
import { describe, it, expect } from "vitest";
import {
  planFreshTopic, overusedHits, dropOverusedLines, buildFreshTopicNote, saidSameContent, topicWordsOf,
} from "@shared/freshTopic";

const RECENT: string[] = [
  "サンプルサロンに入社した先輩は、技術を覚えられるか不安だったそう。\nでも「スタッフが優しいから安心できた」って。",
  "ネイリストって、技術は見て盗むもの？\n未経験で入社した先輩も、最初は不安でした。\nサンプルサロンはチームで教えます。",
  "異業種からの転職、秋だからこそ考えませんか？\n駅前のサンプルサロンには、2年で役職者になった先輩もいます。\n「スタッフの優しさが一番安心できた」そうです。",
  "「技術、覚えられるかな」って不安でした。\n駅前のサンプルサロン。\n目指すネイリスト像、聞かせてください。",
  "異業種からの先輩が「職人のようだ」と話します。\nサンプルサロンの技術は実践で身につくんです。",
  "創業20年のサンプルサロン。\n異業種から転職し、2年で役職についた人もいます。\n一番安心したのは「スタッフが優しい」ことだったそう。",
  "駅前のサンプルサロンなら、未経験でも安心。\n「スタッフが優しい」と話す彼女も最初は不安でした。",
  "ネイリスト未経験だと、技術習得に不安を感じるかもしれません。\n駅前のサンプルサロンなら大丈夫です。",
];
const PROJECT = {
  storeName: "サンプルサロン",
  area: "神奈川県川崎市",
  localTerms: "川崎駅\n武蔵小杉駅",
  businessType: "美容サロン（ネイル）",
  target: "20～30代女性　ネイリストに興味がある",
  n1Customer: "未経験で入社した/技術覚えられるか不安/今では役職につくことができた\n異業種から転職して2年で役職者になった",
  customerWords: "いちばん安心したのはスタッフが優しく、サロンの雰囲気も良かったことです\n自分の手で誰かを笑顔にできるのが嬉しい",
  strength: "座学よりもサロン実習を大切にしている\n季節ごとのデザイン研修がある\nどこも駅近でアクセス抜群",
  faq: ["ノルマはあるのか", "応募から内定までどのくらいかかるか"],
};
const plan = () => planFreshTopic({
  recentPosts: RECENT,
  materials: [PROJECT.strength, PROJECT.n1Customer, PROJECT.customerWords, ...PROJECT.faq],
  protect: [PROJECT.storeName, PROJECT.area, PROJECT.localTerms, PROJECT.businessType, PROJECT.target],
});

describe("話題の偏りを数える", () => {
  it("直近の多くの投稿に出ている話題の言葉を取り出す", () => {
    const p = plan();
    expect(p.overused).toEqual(expect.arrayContaining(["技術", "不安", "スタッフ", "先輩"]));
  });

  it("店名・地名・業種・対象のお客様の言葉は拾わない（毎回出てよい）", () => {
    const p = plan();
    for (const w of ["サンプルサロン", "ネイリスト", "駅前", "川崎"]) expect(p.overused).not.toContain(w);
  });

  it("今日の主題は、まだ使っていない材料から選ぶ（使いすぎの話題を含む材料は選ばない）", () => {
    const p = plan();
    expect(p.topic).not.toBeNull();
    expect(overusedHits(p.topic!, p)).toHaveLength(0);
    expect(p.topic).not.toMatch(/未経験|役職/);
  });

  it("枠ごとに別の材料を選ぶ（同じ日の3案が同じ主題にならない）", () => {
    const base = { recentPosts: RECENT, materials: [PROJECT.strength, ...PROJECT.faq], protect: [PROJECT.storeName, PROJECT.area, PROJECT.target] };
    const topics = new Set([0, 1, 2].map((i) => planFreshTopic({ ...base, index: i }).topic));
    expect(topics.size).toBeGreaterThan(1);
  });

  it("投稿が少ない（3本以下）ときは何もしない", () => {
    expect(planFreshTopic({ recentPosts: RECENT.slice(0, 3), materials: [PROJECT.strength], protect: [] }).overused).toEqual([]);
  });

  it("話題がばらけている方には何もしない", () => {
    const varied = [
      "秋のデザインは深い赤が人気です。\n指先が落ち着いて見えます。",
      "爪の乾燥、ハンドクリームだけで足りていますか？\nオイルを寝る前に1滴。",
      "ジェルの持ちは、根元の処理で変わります。\n3週間を目安にどうぞ。",
      "成人式のご予約、そろそろ埋まり始めています。\n早めのご相談がおすすめです。",
      "短い爪でも映えるデザイン、あります。\n仕事中も邪魔になりません。",
    ];
    expect(planFreshTopic({ recentPosts: varied, materials: [PROJECT.strength], protect: [PROJECT.storeName] }).overused).toEqual([]);
  });

  it("文の途中で改行されただけの行は主題にしない", () => {
    const p = planFreshTopic({
      recentPosts: RECENT,
      materials: ["お茶をされている方に、\nお琴をされている方に、", "季節ごとのデザイン研修がある"],
      protect: [PROJECT.storeName, PROJECT.target],
    });
    expect(p.topic).toBe("季節ごとのデザイン研修がある");
  });
});

describe("材料から使いすぎの話題を外す", () => {
  it("N1顧客像・お客様の声は、使いすぎの言葉が1つでもある行を外す", () => {
    const p = plan();
    const cw = dropOverusedLines(PROJECT.customerWords, p, 1);
    expect(cw).not.toContain("スタッフが優しく");
    expect(cw).toContain("自分の手で誰かを笑顔にできる");
  });

  it("信条・実績は2つ以上含む行だけ外す", () => {
    const p = plan();
    const out = dropOverusedLines("先輩がそばで教える\n技術を覚えられるか不安な方を支える", p, 2);
    expect(out).toBe("先輩がそばで教える");
  });

  it("指示文に、触れない言葉と今日の主題が入る", () => {
    const p = plan();
    const note = buildFreshTopicNote(p);
    expect(note).toContain("同じような内容ばかり");
    expect(note).toContain("「不安」");
    expect(note).toContain(`今日の主題（必須）：「${p.topic}」`);
    expect(buildFreshTopicNote(null)).toBe("");
  });
});

describe("「同じような内容ばかり」と言われたか", () => {
  it("ボタンでも文章でも拾う", () => {
    expect(saidSameContent([{ reason: "same" }])).toBe(true);
    expect(saidSameContent([{ reason: "text", reasonText: "毎回似たような話ばかりです" }])).toBe(true);
    expect(saidSameContent([{ reason: "tone" }, { reason: "text", reasonText: "もっと短く" }])).toBe(false);
    expect(saidSameContent([])).toBe(false);
  });
});

describe("話題の言葉", () => {
  it("漢字・カタカナ2字以上を拾い、ふつうの言葉は拾わない", () => {
    const w = topicWordsOf("お客様と一緒に、技術を磨くスタッフ");
    expect(w).toEqual(expect.arrayContaining(["技術", "スタッフ"]));
    expect(w).not.toContain("客様");
    expect(w).not.toContain("一緒");
  });
});

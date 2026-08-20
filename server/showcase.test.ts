import { describe, it, expect } from "vitest";
import { redact, buildShowcase, generalizeBusiness, prefectureOf, leadLine, type ShowcaseSource } from "./showcase";

const base: ShowcaseSource = {
  postContent: "",
  impressions: 5000,
  likes: 40,
  replies: 5,
  postedAt: new Date("2026-08-01T00:00:00Z"),
  storeName: "たきもと鍼灸整骨院",
  businessType: "鍼灸整骨院",
  area: "岡山県倉敷市玉島",
  localTerms: "新倉敷駅から車で約12分\n玉島中央町",
  showcaseOptOut: false,
};

describe("実例ショーケースの匿名化", () => {
  it("店名・駅名・町名を伏せる", () => {
    const out = redact(
      "たきもと鍼灸整骨院です。新倉敷駅から車で約12分、玉島中央町にあります。",
      base,
    );
    expect(out).not.toContain("たきもと");
    expect(out).not.toContain("新倉敷");
    expect(out).not.toContain("玉島中央町");
  });

  it("未登録の駅名・店名も保険で伏せる", () => {
    const out = redact("金光駅すぐの、さくら整体院に行ってきました。", base);
    expect(out).not.toContain("金光");
    expect(out).not.toContain("さくら");
    expect(out).toContain("駅");
  });

  it("URL・@ユーザー名・電話番号を伏せる", () => {
    const out = redact("詳しくは https://example.com/abc へ。@my_salon_okayama / 086-489-5861", base);
    expect(out).not.toContain("example.com");
    expect(out).not.toContain("my_salon_okayama");
    expect(out).not.toContain("086-489-5861");
  });

  it("掲載を拒否したユーザーの投稿は絶対に出さない", () => {
    const items = buildShowcase([
      { ...base, postContent: "猫背は何歳からでも変わります。固まっているのは骨ではなく、その周りの筋肉だからです。毎日の座り方を少し変えるだけでも、体は確実に応えてくれます。", showcaseOptOut: true },
    ]);
    expect(items).toEqual([]);
  });

  it("反応が小さい投稿は載せない", () => {
    const items = buildShowcase([
      { ...base, postContent: "猫背は何歳からでも変わります。固まっているのは骨ではなく、その周りの筋肉だからです。毎日の座り方を少し変えるだけでも、体は確実に応えてくれます。", impressions: 100 },
    ]);
    expect(items).toEqual([]);
  });

  it("閲覧数の多い順に、最大6件まで", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      ...base,
      postContent: `猫背は何歳からでも変わります。固まっているのは骨ではなく、その周りの筋肉だからです。毎日の座り方を少し変えるだけでも、体は確実に応えてくれます。${i}`,
      impressions: 1000 + i,
    }));
    const items = buildShowcase(many);
    expect(items).toHaveLength(6);
    expect(items[0].impressions).toBe(1009);
  });

  it("店が特定できない粒度のラベルになる", () => {
    const [item] = buildShowcase([
      { ...base, postContent: "猫背は何歳からでも変わります。固まっているのは骨ではなく、その周りの筋肉だからです。毎日の座り方を少し変えるだけでも、体は確実に応えてくれます。" },
    ]);
    expect(item.label).toBe("整骨院・鍼灸院・岡山県");
    expect(item.label).not.toContain("倉敷");
    expect(item.label).not.toContain("たきもと");
  });

  it("複数店舗を持つ利用者は、全店舗の名前が伏せられる", () => {
    const out = redact("たきもと鍼灸整骨院と、さくら整体の両方でやっています。", {
      ...base,
      storeName: "たきもと鍼灸整骨院\nさくら整体",
    });
    expect(out).not.toContain("たきもと");
    expect(out).not.toContain("さくら");
  });

  it("駅名が「駅」抜きで書かれていても伏せる（実データで検出した漏れ）", () => {
    const out = redact("日曜に新倉敷・玉島周辺で遊びに行くならどこですか？", base);
    expect(out).not.toContain("新倉敷");
    expect(out).not.toContain("玉島");
  });

  it("住所の市区町村も伏せる", () => {
    const out = redact("倉敷市でやっています。", { ...base, area: "岡山県倉敷市玉島" });
    expect(out).not.toContain("倉敷");
  });

  it("同じ投稿が重複していても1件にまとめる", () => {
    const dup = { ...base, postContent: "猫背は何歳からでも変わります。固まっているのは骨ではなく、その周りの筋肉だからです。毎日の座り方を少し変えるだけでも、体は確実に応えてくれます。" };
    expect(buildShowcase([dup, { ...dup }])).toHaveLength(1);
  });

  it("表示されただけで反応がない投稿は載せない", () => {
    const items = buildShowcase([
      { ...base, postContent: "猫背は何歳からでも変わります。固まっているのは骨ではなく、その周りの筋肉だからです。毎日の座り方を少し変えるだけでも、体は確実に応えてくれます。", likes: 1, replies: 0 },
    ]);
    expect(items).toEqual([]);
  });

  it("番地・階数を伏せる（実データで検出した漏れ）", () => {
    const out = redact("📍玉島中央町3丁目 911-186 2F", base);
    expect(out).not.toMatch(/911|186|3丁目/);
  });

  it("地名の一部だけが残らない（新◯◯ を作らない）", () => {
    const out = redact("新倉敷でやっています", { ...base, localTerms: "", area: "岡山県倉敷市" });
    expect(out).not.toContain("新◯◯");
    expect(out).not.toContain("倉敷");
  });

  it("同じ店舗の投稿は2件までしか並べない", () => {
    const items = buildShowcase(
      Array.from({ length: 5 }, (_, i) => ({
        ...base,
        postContent: `猫背は何歳からでも変わります。固まっているのは骨ではなく、その周りの筋肉だからです。毎日の座り方を少し変えるだけでも、体は確実に応えてくれます。${i}`,
        impressions: 2000 + i,
        ownerKey: 1,
      })),
    );
    expect(items).toHaveLength(2);
  });

  it("本文は冒頭だけを返し、続きは応答に含めない", () => {
    const long = "夕方になると首がバキバキで集中できないあなたへ。\n猫背や反り腰、姿勢のくずれで諦めかけていませんか？\n体の知識を持つ資格者が、状態を丁寧に拝見します。";
    const [item] = buildShowcase([{ ...base, postContent: long }]);
    expect(item.excerpt.length).toBeLessThanOrEqual(45);
    expect(item.excerpt).not.toContain("資格者が丁寧に");
    expect(JSON.stringify(item)).not.toContain("資格者が丁寧に");
    expect(item.hiddenChars).toBeGreaterThan(0);
  });

  it("全文が出てしまう短い投稿は載せない", () => {
    expect(buildShowcase([
      { ...base, postContent: "猫背は何歳からでも変わります。固まっているのは骨ではなく筋肉だから。" },
    ])).toEqual([]);
  });

  it("載せる投稿には必ず伏せた続きがある", () => {
    const items = buildShowcase([
      { ...base, postContent: "夕方になると首がバキバキで集中できないあなたへ。\n猫背や反り腰、姿勢のくずれで諦めかけていませんか？\n体の知識を持つ資格者が、状態を丁寧に拝見します。" },
    ]);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) expect(it.hiddenChars).toBeGreaterThan(0);
  });

  it("挨拶だけの行は冒頭に使わない", () => {
    expect(leadLine("おはようございます☀\n\n猫背が気になる方からよく聞かれることがあります。"))
      .toContain("猫背");
    const [item] = buildShowcase([{
      ...base,
      postContent: "おはようございます☀\n\n猫背が気になる方から、よくこう聞かれます。もう歳だから戻らないですよね、と。実は逆で、姿勢は何歳からでも変わります。",
    }]);
    expect(item.excerpt).not.toBe("おはようございます☀…");
    expect(item.excerpt).toContain("猫背");
  });

  it("業種と都道府県の丸め", () => {
    expect(generalizeBusiness("パーソナルピラティススタジオ")).toBe("ピラティススタジオ");
    expect(generalizeBusiness("")).toBe("店舗");
    expect(prefectureOf("岡山県浅口市金光町")).toBe("岡山県");
    expect(prefectureOf("")).toBeNull();
  });
});

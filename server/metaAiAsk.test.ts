import { describe, it, expect } from "vitest";
import { validateMetaAiAsk, META_AI_ASK_ANGLES, buildMetaAiAskPrompt, shortAreaName, buildMetaAiCallPost, buildMetaAiCallPostOfKind, callAreaLabel, splitDailyQuota } from "../shared/metaAiAsk";

describe("Meta AIに聞く返信：質問の検査", () => {
  it("正しい形はそのまま通る", () => {
    const r = validateMetaAiAsk("@meta.ai ふくらはぎがつりやすいのはなぜ？");
    expect(r.ok).toBe(true);
    expect(r.text).toBe("@meta.ai ふくらはぎがつりやすいのはなぜ？");
  });
  it("先頭の @meta.ai が無ければ補う", () => {
    const r = validateMetaAiAsk("コーヒーの焙煎で味が変わる理由は？");
    expect(r.ok).toBe(true);
    expect(r.text.startsWith("@meta.ai ")).toBe(true);
  });
  it("引用符で囲まれていても中身を使う", () => {
    expect(validateMetaAiAsk("「@meta.ai 寝違えが朝に起きやすいのはなぜ？」").ok).toBe(true);
  });
  it("長すぎる・疑問文でない・URL・店への言及・効能断定・絵文字は不合格", () => {
    expect(validateMetaAiAsk("@meta.ai " + "あ".repeat(60) + "？").reason).toBe("too_long");
    expect(validateMetaAiAsk("@meta.ai 肩こりは姿勢が原因です。").reason).toBe("not_question");
    expect(validateMetaAiAsk("@meta.ai https://example.com は何？").reason).toBe("url_or_tag");
    expect(validateMetaAiAsk("@meta.ai このお店の施術は何が違う？").reason).toBe("store_reference");
    expect(validateMetaAiAsk("@meta.ai 腰痛は整体で治る？").reason).toBe("efficacy_claim");
    expect(validateMetaAiAsk("@meta.ai なぜ😊？").reason).toBe("emoji");
  });
  it("店名が混ざったら不合格", () => {
    const r = validateMetaAiAsk("@meta.ai テストカフェのコーヒーは何が違う？", ["テストカフェ"]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("forbidden:テストカフェ");
  });
  it("地域名は入れる。無ければ不合格（三上様指示 2026-09-06）", () => {
    expect(validateMetaAiAsk("@meta.ai 倉敷市で秋に肩こりが増えるのはなぜ？", [], "岡山県倉敷市中央").ok).toBe(true);
    const r = validateMetaAiAsk("@meta.ai 秋に肩こりが増えるのはなぜ？", [], "岡山県倉敷市中央");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_area");
  });
  it("地域名は市区町村まで（都道府県と町名は落とす）", () => {
    expect(shortAreaName("岡山県倉敷市中央")).toBe("倉敷市");
    expect(shortAreaName("東京都渋谷区道玄坂")).toBe("渋谷区");
    expect(shortAreaName("")).toBe("");
  });
  it("知識系の切り口だけが対象", () => {
    expect(META_AI_ASK_ANGLES.has("pro_tip")).toBe(true);
    expect(META_AI_ASK_ANGLES.has("reservation_funnel")).toBe(false);
    expect(META_AI_ASK_ANGLES.has("customer_voice")).toBe(false);
  });
  it("プロンプトに本文と禁止事項が入る", () => {
    const p = buildMetaAiAskPrompt("湿布を貼っても肩こりが戻るのは…", "整体院", "岡山県倉敷市中央");
    expect(p).toContain("湿布を貼っても");
    expect(p).toContain("地域名「倉敷市」を自然に入れる");
    expect(p).toContain("お店・施術・商品・実績・効果については聞かない");
    expect(p).toContain("60文字以内");
  });
});

describe("Meta AI 呼びかけ投稿（本文が @meta.ai ＋依頼文）", () => {
  const src = { storeName: "テスト整体院", businessType: "整体院", area: "岡山県倉敷市中央", target: "デスクワークの30〜50代", mainProblem: "慢性的な肩こり、朝の腰の痛み", menu: ["骨盤矯正", "猫背改善"] };
  const sep = new Date("2026-09-24T06:00:00+09:00");
  it("先頭は @meta.ai、絵文字なし、120字以内", () => {
    for (let d = 0; d < 10; d++) {
      const t = buildMetaAiCallPost(src, d, sep)!;
      expect(t.startsWith("@meta.ai ")).toBe(true);
      expect(/[\uD83C-\uD83E][\uDC00-\uDFFF]/.test(t)).toBe(false);
      expect(Array.from(t).length).toBeLessThanOrEqual(120);
    }
  });
  it("材料が揃っていれば10日間すべて違う文（同じパターンが続かない・2026-09-24 三上様指示）", () => {
    const all = [...Array(10)].map((_, d) => buildMetaAiCallPost(src, d, sep));
    expect(new Set(all).size).toBe(10);
    for (let d = 1; d < 10; d++) expect(all[d]).not.toBe(all[d - 1]);
  });
  it("宣伝を頼む型は1つだけ。表示が落ちた「届けて」「他のお店と何が違う？」は出さない", () => {
    const all = [...Array(10)].map((_, d) => buildMetaAiCallPost(src, d, sep)!);
    expect(all.filter((t) => t.includes("テスト整体院")).length).toBe(1);
    expect(all.some((t) => t.includes("届けて"))).toBe(false);
    expect(all.some((t) => t.includes("何が違う"))).toBe(false);
  });
  it("地元の話題・来店前の質問・体の質問が入る", () => {
    const all = [...Array(10)].map((_, d) => buildMetaAiCallPost(src, d, sep)!).join("\n");
    expect(all).toContain("@meta.ai 倉敷市中央の名産品と言えば？");
    expect(all).toContain("@meta.ai 倉敷市中央周辺で、秋に出かけるならおすすめの場所は？");
    expect(all).toContain("@meta.ai 初めて整体院に行くとき、知っておくと安心なことは？");
    expect(all).toContain("@meta.ai 整体院を選ぶときに、確認しておくといいポイントは？");
    expect(all).toContain("@meta.ai 朝晩の寒暖差が大きいこの時期、体がだるいと感じるときに自分でできる工夫は？");
    expect(all).toContain("@meta.ai 慢性的な肩こりが気になる人が、毎日の生活で気をつけるといいことは？");
  });
  it("効果・結果を言い切る聞き方をしない", () => {
    const all = [...Array(10)].map((_, d) => buildMetaAiCallPost(src, d, sep)!).join("\n");
    expect(/治る|治す|改善する|効果がある|必ず/.test(all)).toBe(false);
  });
  it("季節は日本時間の月で変わる", () => {
    const jan = new Date("2026-01-10T06:00:00+09:00");
    expect(buildMetaAiCallPostOfKind(src, "local_season", jan)).toContain("冬に出かけるなら");
    expect(buildMetaAiCallPostOfKind(src, "body_season", jan)).toContain("寒さが厳しいこの時期");
  });
  it("体の業種でなければ体の質問は出さない", () => {
    const shop = { storeName: "テスト呉服店", businessType: "呉服店", area: "岡山県倉敷市中央", mainProblem: "着物の手入れ" };
    expect(buildMetaAiCallPostOfKind(shop, "body_season", sep)).toBeNull();
    expect(buildMetaAiCallPostOfKind(shop, "body_daily", sep)).toBeNull();
    expect(buildMetaAiCallPostOfKind(shop, "first_visit", sep)).toBe("@meta.ai 初めて呉服店を利用するとき、知っておくと安心なことは？");
  });
  it("悩みは先頭の句だけ使い、動詞で終わる悩みは使わない（届けたい方に切り替える）", () => {
    const t = buildMetaAiCallPostOfKind(src, "merit", sep)!;
    expect(t).toContain("慢性的な肩こりに悩む人");
    expect(t).not.toContain("朝の腰の痛み");
    const t2 = buildMetaAiCallPostOfKind({ ...src, mainProblem: "体型が戻らない" }, "merit", sep)!;
    expect(t2).not.toContain("戻らないに悩む");
    expect(t2).toContain("デスクワークの30〜50代に");
    expect(buildMetaAiCallPostOfKind({ ...src, mainProblem: "体型が戻らない" }, "body_daily", sep)).toBeNull();
    const t3 = buildMetaAiCallPostOfKind({ ...src, mainProblem: "一人で入りづらい", target: "仕事帰りの30代" }, "merit", sep)!;
    expect(t3).not.toContain("入りづらいに悩む");
    expect(t3).toContain("仕事帰りの30代に");
  });
  it("業種の括弧書きは落とし、「・」の列挙は先頭だけ", () => {
    const t = buildMetaAiCallPostOfKind({ businessType: "マシンピラティススタジオ（整体・美容鍼併設）", area: "岡山県倉敷市玉島" }, "recommend")!;
    expect(t).toBe("@meta.ai 倉敷市玉島でマシンピラティススタジオのおすすめを教えて");
    expect(buildMetaAiCallPostOfKind({ businessType: "整骨院・接骨院", area: "倉敷市" }, "recommend")).toBe("@meta.ai 倉敷市で整骨院のおすすめを教えて");
  });
  it("得意分野は「おすすめ」型の業種の前に付く", () => {
    expect(buildMetaAiCallPostOfKind({ businessType: "整体院", area: "倉敷市", focus: "ダイエット" }, "recommend")).toBe("@meta.ai 倉敷市でダイエットに強い整体院のおすすめを教えて");
  });
  it("材料が無くても「強みを伝えて」型は作れる", () => {
    expect(buildMetaAiCallPost({}, 0)).toBe("@meta.ai うちのお店の強みを、来店されたことのない人に伝えて");
  });
});

describe("呼びかけ投稿の地域名は市より細かく（三上様指示 2026-09-06）", () => {
  it("町名＋最寄り駅", () => {
    expect(callAreaLabel("岡山県倉敷市玉島", "玉島中央町\nJR新倉敷駅から車で約7分")).toBe("新倉敷・玉島");
    expect(callAreaLabel("浅口市金光町占見新田283-1", "金光駅から徒歩約6分\n金光町占見新田\n鴨方駅\n笠岡駅")).toBe("鴨方・金光町");
    expect(callAreaLabel("岡山県倉敷市玉島乙島", "玉島乙島\n新倉敷駅から車で約12分")).toBe("新倉敷・玉島乙島");
  });
  it("地域欄に駅が書かれていれば駅名を使う", () => {
    expect(callAreaLabel("埼玉県川口市戸塚安行駅、東川口駅", null)).toBe("戸塚安行・東川口");
  });
  it("番地・丁目は落とす。町名だけのときは町名", () => {
    expect(callAreaLabel("広島県廿日市市天神4-10", "")).toBe("廿日市市天神");
    expect(callAreaLabel("茨城県土浦市神立中央1丁目", null)).toBe("神立中央");
    expect(callAreaLabel("岡山市北区京橋町", null)).toBe("岡山市北区京橋町");
    expect(callAreaLabel("岡山県倉敷市中央", null)).toBe("倉敷市中央");
  });
  it("町名も駅も無ければ市、それも無ければ都道府県。文章が入った登録は使わない", () => {
    expect(callAreaLabel("倉敷市", null)).toBe("倉敷市");
    expect(callAreaLabel("神奈川県", null)).toBe("神奈川");
    expect(callAreaLabel("岡山市北区の整体院です。腰痛が得意です。", null)).toBe("");
  });
  it("悩みが改行区切りなら先頭だけ", () => {
    const t = buildMetaAiCallPostOfKind({ businessType: "整骨院", area: "倉敷市玉島", mainProblem: "繰り返す腰痛\n猫背" }, "merit")!;
    expect(t).toContain("繰り返す腰痛に悩む人");
    expect(t).not.toContain("猫背");
  });
  it("投稿文に細かい地域名が入る", () => {
    const t = buildMetaAiCallPostOfKind({ businessType: "マシンピラティススタジオ", area: "岡山県倉敷市玉島", localTerms: "JR新倉敷駅から車で約7分", storeName: "Moveact玉島店" }, "local_specialty")!;
    expect(t).toBe("@meta.ai 新倉敷・玉島の名産品と言えば？");
  });
});

describe("1日の枠の分け方（呼びかけ投稿は契約本数のうちの1件）", () => {
  it("3件→呼びかけ1＋通常2、2件→1＋1、1件（ライト）→通常のみ", () => {
    expect(splitDailyQuota(3, true)).toEqual({ regular: 2, call: 1 });
    expect(splitDailyQuota(2, true)).toEqual({ regular: 1, call: 1 });
    expect(splitDailyQuota(1, true)).toEqual({ regular: 1, call: 0 });
  });
  it("OFFなら全部通常", () => {
    expect(splitDailyQuota(3, false)).toEqual({ regular: 3, call: 0 });
  });
});

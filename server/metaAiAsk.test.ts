import { describe, it, expect } from "vitest";
import { validateMetaAiAsk, META_AI_ASK_ANGLES, buildMetaAiAskPrompt, shortAreaName, buildMetaAiCallPost } from "../shared/metaAiAsk";

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
  it("先頭は @meta.ai、地域名が入り、絵文字なし", () => {
    for (let d = 0; d < 5; d++) {
      const t = buildMetaAiCallPost(src, d)!;
      expect(t.startsWith("@meta.ai ")).toBe(true);
      expect(/[\uD83C-\uD83E][\uDC00-\uDFFF]/.test(t)).toBe(false);
    }
    expect(buildMetaAiCallPost(src, 0)).toContain("倉敷市");
  });
  it("日替わりで型が変わり、店名を使う型がある", () => {
    const all = new Set([0, 1, 2, 3, 4].map((d) => buildMetaAiCallPost(src, d)));
    expect(all.size).toBeGreaterThanOrEqual(4);
    expect([...all].some((t) => t!.includes("テスト整体院"))).toBe(true);
  });
  it("悩みは先頭の句だけ使い、動詞で終わる悩みは使わない（届けたい方に切り替える）", () => {
    const t = buildMetaAiCallPost(src, 2)!;
    expect(t).toContain("慢性的な肩こりに悩む人");
    expect(t).not.toContain("朝の腰の痛み");
    const t2 = buildMetaAiCallPost({ ...src, mainProblem: "体型が戻らない" }, 2)!;
    expect(t2).not.toContain("戻らないに悩む");
    expect(t2).toContain("デスクワークの30〜50代に");
  });
  it("業種の括弧書きと「スタジオ」「院」は落とす", () => {
    const t = buildMetaAiCallPost({ businessType: "マシンピラティススタジオ（整体・美容鍼併設）", area: "岡山県倉敷市玉島" }, 1)!;
    expect(t).toBe("@meta.ai 倉敷市でマシンピラティスのおすすめを教えて");
    expect(buildMetaAiCallPost({ businessType: "整体院", area: "倉敷市" }, 1)).toBe("@meta.ai 倉敷市で整体のおすすめを教えて");
  });
  it("材料が無くても「強みを伝えて」型は作れる", () => {
    expect(buildMetaAiCallPost({}, 0)).toBe("@meta.ai うちのお店の強みを、来店されたことのない人に伝えて");
  });
});

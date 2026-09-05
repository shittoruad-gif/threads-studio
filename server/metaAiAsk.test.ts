import { describe, it, expect } from "vitest";
import { validateMetaAiAsk, META_AI_ASK_ANGLES, buildMetaAiAskPrompt, shortAreaName } from "../shared/metaAiAsk";

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

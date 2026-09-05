import { describe, it, expect } from "vitest";
import { validateMetaAiAsk, META_AI_ASK_ANGLES, buildMetaAiAskPrompt } from "../shared/metaAiAsk";

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
  it("店名・地域名が混ざったら不合格", () => {
    const r = validateMetaAiAsk("@meta.ai 倉敷市で肩こりが多いのはなぜ？", ["テストカフェ", "倉敷市"]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("forbidden:倉敷市");
  });
  it("知識系の切り口だけが対象", () => {
    expect(META_AI_ASK_ANGLES.has("pro_tip")).toBe(true);
    expect(META_AI_ASK_ANGLES.has("reservation_funnel")).toBe(false);
    expect(META_AI_ASK_ANGLES.has("customer_voice")).toBe(false);
  });
  it("プロンプトに本文と禁止事項が入る", () => {
    const p = buildMetaAiAskPrompt("湿布を貼っても肩こりが戻るのは…", "整体院");
    expect(p).toContain("湿布を貼っても");
    expect(p).toContain("お店・施術・商品・実績・効果については聞かない");
    expect(p).toContain("60文字以内");
  });
});

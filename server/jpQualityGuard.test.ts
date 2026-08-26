import { describe, it, expect } from "vitest";
import {
  checkNaturalized, hiraganaRatio, endsWithQuestion, HIRAGANA_RATIO_MAX,
} from "../shared/jpQualityGuard";

const OK_ORIGINAL = "肩こりの原因は、揉み方ではなく座り方にあります。当院では体の使い方から見直します。";

describe("日本語品質ガード", () => {
  it("自然な文はそのまま通る", () => {
    const v = checkNaturalized(
      "肩こりの原因は、揉み方ではなく座り方にあります。\n\n当院では体の使い方から見直します。",
      OK_ORIGINAL,
      { allowQuestionEnding: false },
    );
    expect(v.ok).toBe(true);
  });

  it("お手本のコピー「同じ悩みの方、いませんか」を弾く（実際に起きた劣化）", () => {
    const v = checkNaturalized(
      "姿勢を気にしても続かない…\n\n同じ悩みの方、いませんか？",
      OK_ORIGINAL,
      { allowQuestionEnding: true },
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("同じ悩みの方");
  });

  it("口癖「正直、」を弾く（12本中5本に出ていた）", () => {
    const v = checkNaturalized(
      "正直、これすごく多いです。\n\n投稿が止まると機会損失です。",
      OK_ORIGINAL,
      { allowQuestionEnding: false },
    );
    expect(v.ok).toBe(false);
  });

  it("ひらがなに開きすぎた文を弾く", () => {
    const v = checkNaturalized(
      "からだがだるいなあってかんじること、ありませんか。むりしないでいいんですよ。ゆっくりやすんでくださいね。",
      OK_ORIGINAL,
      { allowQuestionEnding: false },
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("ひらがな率");
  });

  it("会話型でない投稿の言い切りを問いかけに変えたら弾く（実際に起きた劣化）", () => {
    const v = checkNaturalized(
      "肩こりの原因は座り方にあります。\n\n体の使い方、気になりませんか？",
      OK_ORIGINAL, // 元は言い切り
      { allowQuestionEnding: false },
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("問いかけ");
  });

  it("会話型なら問いかけ締めを許す", () => {
    const v = checkNaturalized(
      "クーラー26度は暑いし25度は寒い。\n\nこの1度、どうしてますか？",
      OK_ORIGINAL,
      { allowQuestionEnding: true },
    );
    expect(v.ok).toBe(true);
  });

  it("元から問いかけだった文は会話型でなくても通す（リライトのせいではない）", () => {
    const v = checkNaturalized(
      "「痛い施術ほど効く」と思っていませんか？\n\nそれは誤解です。",
      "「痛い施術ほど効く」と思っていませんか？それは誤解です。",
      { allowQuestionEnding: false },
    );
    expect(v.ok).toBe(true);
  });

  it("絵文字や記号で終わっていても締めの形を正しく判定する", () => {
    expect(endsWithQuestion("気になりますか？😊")).toBe(true);
    expect(endsWithQuestion("大丈夫ですよ😊")).toBe(false);
  });

  it("ひらがな率の計算が妥当（漢字かな交じりの普通の文は上限内）", () => {
    const normal = "肩こりの原因は座り方にあります。体の使い方から見直しませんか。";
    expect(hiraganaRatio(normal)).toBeLessThan(HIRAGANA_RATIO_MAX);
    const opened = "かたこりのげんいんは、すわりかたにあるんです。";
    expect(hiraganaRatio(opened)).toBeGreaterThan(HIRAGANA_RATIO_MAX);
  });
});

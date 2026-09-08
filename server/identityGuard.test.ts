import { describe, it, expect } from "vitest";
import { checkIdentity, identityTokens } from "../shared/identityGuard";

/** 比嘉先生（はいさい整骨院）の登録に近い形 */
const HIGA = {
  storeName: "はいさい整骨院",
  area: "千葉県八千代市勝田台",
  localTerms: null,
  proof: "開業11年。\n業界歴20年。\nのべ担当20万人以上。",
  strength: "業界歴20年、施術件数20万人以上、多彩な経験から一人一人のお話をしっかりと聞いて施術いたします。",
  usp: "技術力、経験年数、人数、沖縄出身で親しみやすい人柄",
  counselingResult: JSON.stringify({
    originStory: "沖縄の方言で『イチャリバチョーデー』が好きです",
    faq: ["駐輪場はありますか？ありません。勝田台駅", "東葉勝田台駅より南口から徒歩4分の商店街にあります。"],
  }),
};

describe("この店らしさの必須条件", () => {
  it("登録から『店を指す言葉』を取り出す（都道府県だけは入れない）", () => {
    const t = identityTokens(HIGA);
    for (const w of ["はいさい整骨院", "八千代市", "八千代", "勝田台", "11年", "20年", "20万人", "20万", "勝田台駅", "沖縄"]) {
      expect(t).toContain(w);
    }
    expect(t).not.toContain("千葉県");
  });

  it("実際に出た『どこの整骨院でも出せる文』を不合格にする", () => {
    const v = checkIdentity(
      "デスクワークで肩が凝る方へ、3秒でできること。\n肩の辛さ、腕のねじれが原因のことも多いです。\n手のひらを外に向けて、腕を回すだけ。\nこれだけで楽になる方もいます。",
      HIGA,
    );
    expect(v.ok).toBe(false);
    expect(v.hint).toContain("必ず1つ入れる");
  });

  it("地名・店名・実績のどれか1つ入っていれば通る", () => {
    expect(checkIdentity("勝田台で整骨院をしています。肩の重さ、まずは姿勢から見直しましょう。", HIGA).ok).toBe(true);
    expect(checkIdentity("業界歴20年、いちばん多いご相談は肩こりです。", HIGA).ok).toBe(true);
    expect(checkIdentity("沖縄出身の私が千葉で開業して、今年で11年になります。", HIGA).ok).toBe(true);
    expect(checkIdentity("はいさい整骨院です。", HIGA).found).toContain("はいさい整骨院");
  });

  it("全角数字・空白の違いは吸収する", () => {
    expect(checkIdentity("開業 １１年 の整骨院です", HIGA).ok).toBe(true);
  });

  it("登録に何も無ければ止めない", () => {
    expect(checkIdentity("こんにちは", { storeName: null, area: null }).ok).toBe(true);
  });
});

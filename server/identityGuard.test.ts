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

/**
 * 2026-09-09 の実測。リライト（naturalizeContent）が「50〜100文字に収める・
 * 情報は削ってよい」の指示どおり店名・地名を先に削り、そのあとの identityGuard に
 * 落ちて枠ごと作り直し→3回で諦め→その枠は投稿ゼロ、が繰り返し起きていた。
 * 下書きには店を指す言葉が入っていたので、リライト前へ戻せば枠は救える。
 */
describe("リライトが店名・地名を削ったときは下書きに戻せる（2026-09-10）", () => {
  const TENJIN = {
    storeName: "廿日市天神整体院",
    area: "広島県廿日市市",
    localTerms: null,
    proof: null,
    strength: null,
    usp: null,
    counselingResult: null,
  };

  it("下書きには店を指す言葉があり、リライト後には無い", () => {
    const draft = "廿日市で長引く肩こり。\n湿布でごまかしても、原因の姿勢は変わりません。\n姿勢から見直しています。";
    const rewritten = "長引く肩こり。\n湿布でごまかしても、原因の姿勢は変わりません。\n姿勢から見直しています。";
    expect(checkIdentity(rewritten, TENJIN).ok).toBe(false);
    expect(checkIdentity(draft, TENJIN).ok).toBe(true);
    expect(checkIdentity(draft, TENJIN).found).toContain("廿日市");
  });

  it("下書きにも入っていなければ、戻さず作り直すのが正しい", () => {
    const draft = "長引く肩こり。湿布でごまかしても、原因の姿勢は変わりません。";
    expect(checkIdentity(draft, TENJIN).ok).toBe(false);
  });

  it("リライトに渡す「消してはいけない言葉」は、下書きに実在するものだけ", () => {
    const draft = "廿日市で長引く肩こり。姿勢から見直しています。";
    // found は下書きに実際に入っていた言葉。登録にあっても本文に無い言葉は渡さない
    const keep = checkIdentity(draft, TENJIN).found;
    expect(keep).toContain("廿日市");
    expect(keep).not.toContain("廿日市天神整体院");
  });
});

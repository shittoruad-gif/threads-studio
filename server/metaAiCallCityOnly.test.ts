import { describe, it, expect } from "vitest";
import { callAreaLabel, callAreaCityOnlyByRules, buildMetaAiCallPostOfKind } from "../shared/metaAiAsk";

/**
 * 2026-10-22 ご質問 #60（川邊様・しん整骨院）
 * 「Metaに返答してもらう投稿で、いつも岐阜市梅園町でという質問をしますが、岐阜市でと町名を無くした投稿にできますか？」
 * → お店の情報の地域は変えず、書き方の決まり「呼びかけは町名なしで」で、そのアカウントの呼びかけだけ市区町村までにする。
 */
describe("呼びかけの地域を市区町村までにする決まり", () => {
  it("決まりの文を見分ける（呼びかけの話だと分かるものだけ）", () => {
    expect(callAreaCityOnlyByRules(["呼びかけは町名なしで"])).toBe(true);
    expect(callAreaCityOnlyByRules(["Meta AIの質問は岐阜市まで"])).toBe(true);
    expect(callAreaCityOnlyByRules(["呼びかけの地域は市だけ"])).toBe(true);
    expect(callAreaCityOnlyByRules(["メタへの質問に町名を入れない"])).toBe(true);
    expect(callAreaCityOnlyByRules(["町名は入れない"])).toBe(false);
    expect(callAreaCityOnlyByRules(["最後は必ず「ご相談はLINEから」で締める"])).toBe(false);
    expect(callAreaCityOnlyByRules([])).toBe(false);
    expect(callAreaCityOnlyByRules(null)).toBe(false);
  });

  it("岐阜県岐阜市梅園町：ふだんは「岐阜市梅園町」・決まりがあれば「岐阜市」", () => {
    expect(callAreaLabel("岐阜県岐阜市梅園町")).toBe("岐阜市梅園町");
    expect(callAreaLabel("岐阜県岐阜市梅園町", null, { cityOnly: true })).toBe("岐阜市");
  });

  it("駅名が入る地域も、決まりがあれば市区町村まで", () => {
    expect(callAreaLabel("岡山県倉敷市玉島", "JR新倉敷駅から車で約7分")).toBe("新倉敷・玉島");
    expect(callAreaLabel("岡山県倉敷市玉島", "JR新倉敷駅から車で約7分", { cityOnly: true })).toBe("倉敷市");
  });

  it("呼びかけ文にも効く", () => {
    const src = { storeName: "しん整骨院", businessType: "整体院・整骨院", area: "岐阜県岐阜市梅園町" };
    expect(buildMetaAiCallPostOfKind(src, "local_specialty")).toContain("岐阜市梅園町");
    const t = buildMetaAiCallPostOfKind({ ...src, cityOnly: true }, "local_specialty")!;
    expect(t).toContain("岐阜市の");
    expect(t).not.toContain("梅園町");
  });
});

describe("呼びかけの地域の決まりは、ふつうの投稿の指示に入れない", () => {
  it("buildOwnerRulesNote から外れる・ほかの決まりは残る", async () => {
    const { buildOwnerRulesNote } = await import("../shared/ownerRules");
    const note = buildOwnerRulesNote(["呼びかけは町名なしで", "「完全予約制」と必ず書く"]);
    expect(note).not.toContain("町名");
    expect(note).toContain("完全予約制");
    expect(buildOwnerRulesNote(["呼びかけは町名なしで"])).toBe("");
  });
});

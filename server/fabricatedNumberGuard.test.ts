import { describe, it, expect } from "vitest";
import { findFabricatedNumbers, registeredFactsOf } from "../shared/fabricatedNumberGuard";

/**
 * 登録情報に無い数字をAIが作らないこと（2026-09-08 比嘉先生の当日補充で
 * 「3人に1人が知らないこと」が出た。実績は「開業11年・業界歴20年・のべ20万人以上」だけ）。
 */
describe("登録に無い数字の検出", () => {
  const facts = registeredFactsOf({ proof: "開業11年。\n業界歴20年。\nのべ担当20万人以上。", area: "千葉県八千代市勝田台" });

  it("実際に出た『3人に1人』を捕まえる", () => {
    const r = findFabricatedNumbers("八千代市で肩こりに悩む人の3人に1人が知らないこと。夕方になると首がガチガチ。", facts);
    expect(r.map((x) => x.text)).toContain("3人に1人");
  });

  it("登録にある数字は通す（表記ゆれも）", () => {
    expect(findFabricatedNumbers("開業11年、のべ20万人以上を担当してきました。", facts)).toEqual([]);
    expect(findFabricatedNumbers("業界歴20年以上の経験があります。", facts)).toEqual([]);
  });

  it("時刻・日付・年齢帯・住所は数字でも対象にしない", () => {
    expect(findFabricatedNumbers("18時まで受付。9月8日は休み。30代の方が多い。勝田台1丁目。初回60分。", facts)).toEqual([]);
  });

  it("割合・順位・倍率は根拠が無ければ捕まえる", () => {
    const r = findFabricatedNumbers("満足度98%。地域No.1。県内で1位。効果が3倍。", facts).map((x) => x.text);
    expect(r).toContain("98%");
    expect(r).toContain("1位");
    expect(r).toContain("3倍");
  });

  it("本文が空なら何も返さない", () => {
    expect(findFabricatedNumbers("", facts)).toEqual([]);
  });
});

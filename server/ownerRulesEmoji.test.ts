import { describe, it, expect } from "vitest";
import { requiredEmojisFromRules, ensureRequiredEmojis, applyOwnerRequiredEmojis } from "../shared/ownerRules";

describe("決まりで指定された絵文字をすべての投稿に入れる（2026-10-31）", () => {
  it("すべての投稿の決まりだけ拾う・名前の書き方や「使わない」は拾わない", () => {
    expect(requiredEmojisFromRules(["すべての投稿に必ず💫を入れる"])).toEqual(["💫"]);
    expect(requiredEmojisFromRules(["投稿には毎回🌸を付ける"])).toEqual(["🌸"]);
    expect(requiredEmojisFromRules(["サロン名は必ず『サンプル交流会💫』と書く（💫を付ける）"])).toEqual([]);
    expect(requiredEmojisFromRules(["すべての投稿で😊は使わない"])).toEqual([]);
    expect(requiredEmojisFromRules(["最後はLINEで締める"])).toEqual([]);
    expect(requiredEmojisFromRules(["すべての投稿に🙇‍♀️を入れる"])).toEqual(["🙇‍♀️"]);
  });
  it("無ければ1行目の終わりに足す・。は置き換える・あれば触らない", () => {
    expect(ensureRequiredEmojis("11月11日に開催します。\n詳しくはプロフィールから", ["💫"])).toBe("11月11日に開催します💫\n詳しくはプロフィールから");
    expect(ensureRequiredEmojis("\n岡山で交流会\n二行目", ["💫"])).toBe("\n岡山で交流会💫\n二行目");
    expect(ensureRequiredEmojis("もう入っています💫\n二行目", ["💫"])).toBe("もう入っています💫\n二行目");
    expect(ensureRequiredEmojis("", ["💫"])).toBe("");
    expect(ensureRequiredEmojis("そのまま", [])).toBe("そのまま");
  });
  it("保存文字列から", () => {
    const rules = "片付けの話は書かない\nすべての投稿に必ず💫を入れる（サロン名が出ない投稿にも）";
    expect(applyOwnerRequiredEmojis("岡山の経営者さんへ\n本文", rules)).toBe("岡山の経営者さんへ💫\n本文");
    expect(applyOwnerRequiredEmojis("岡山の経営者さんへ", null)).toBe("岡山の経営者さんへ");
  });
});

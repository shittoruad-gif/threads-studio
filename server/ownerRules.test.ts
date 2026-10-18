import { describe, it, expect } from "vitest";
import { parseOwnerRules, parseOwnerRuleMessage, addOwnerRule, removeOwnerRule, buildOwnerRulesNote, serializeOwnerRules, OWNER_RULES } from "../shared/ownerRules";

describe("書き方の決まり（お客様が自分で足す）", () => {
  it("1行1つ・先頭の記号は外す・重複と長すぎる行は落とす・上限10件", () => {
    const long = "あ".repeat(OWNER_RULES.maxLen + 1);
    const text = ["- 最後はLINEで締める", "・最後はLINEで締める", long, "", "  「患者さん」と書かない  ", ...Array.from({ length: 12 }, (_, i) => `決まり${i}`)].join("\n");
    const r = parseOwnerRules(text);
    expect(r[0]).toBe("最後はLINEで締める");
    expect(r[1]).toBe("「患者さん」と書かない");
    expect(r).not.toContain(long);
    expect(r).toHaveLength(OWNER_RULES.maxRules);
    expect(serializeOwnerRules(r)).toBe(r.join("\n"));
    expect(parseOwnerRules(null)).toEqual([]);
  });
  it("「決まり：〜」「ルール 〜」だけを拾う", () => {
    expect(parseOwnerRuleMessage("決まり：最後はLINEで締める")).toBe("最後はLINEで締める");
    expect(parseOwnerRuleMessage("きまり 1行目は質問にしない")).toBe("1行目は質問にしない");
    expect(parseOwnerRuleMessage("ルール:絵文字なし")).toBe("絵文字なし");
    expect(parseOwnerRuleMessage("決まりごとが多くて大変です")).toBeUndefined();
    expect(parseOwnerRuleMessage("今日の決まりは？")).toBeUndefined();
    expect(parseOwnerRuleMessage("決まり：")).toBeUndefined();
  });
  it("足す・消す・理由", () => {
    const a = addOwnerRule(null, "最後はLINEで締める");
    expect(a).toEqual({ rules: ["最後はLINEで締める"], added: true });
    expect(addOwnerRule(a.rules.join("\n"), "最後はLINEで締める").reason).toMatch(/すでに/);
    expect(addOwnerRule(null, "あ".repeat(OWNER_RULES.maxLen + 1)).reason).toMatch(/字まで/);
    const full = Array.from({ length: OWNER_RULES.maxRules }, (_, i) => `r${i}`).join("\n");
    expect(addOwnerRule(full, "もう1つ").reason).toMatch(/件まで/);
    expect(removeOwnerRule("a\nb\nc", 1)).toEqual(["a", "c"]);
  });
  it("プロンプトの文：決まりが無ければ空・あれば最優先の見出しと事実の注意", () => {
    expect(buildOwnerRulesNote([])).toBe("");
    const note = buildOwnerRulesNote(["最後はLINEで締める", "絵文字なし"]);
    expect(note).toMatch(/すべての指示より優先/);
    expect(note).toMatch(/- 最後はLINEで締める\n- 絵文字なし/);
    expect(note).toMatch(/事実.*入力情報だけ/);
  });
});

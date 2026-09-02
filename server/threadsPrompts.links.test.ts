import { describe, it, expect } from "vitest";
import { generateThreadsPrompt } from "../shared/threadsPrompts";
import { parseProjectLinks } from "../shared/projectLinks";

/**
 * links は DB に JSON文字列で入っている。配列に直さずそのまま渡すと
 * プロンプト組み立ての中で links.find が呼べず落ちる。
 * 実際に固定投稿がこれで毎回「投稿をうまく作れませんでした」になっていた。
 */
const BASE = {
  postType: "pinned" as const,
  purpose: "cv" as const,
  storeName: "テスト整体院",
  businessType: "整体院",
  area: "岡山市北区",
  target: "肩こりに悩む30代女性",
  mainProblem: "慢性的な肩こり",
  strength: "国家資格者による施術",
};

const RAW_LINKS = JSON.stringify([
  { id: "l1", type: "line", label: "公式LINE", url: "https://lin.ee/example" },
  { id: "l2", type: "reservation", label: "Web予約", url: "https://example.com/reserve" },
]);

describe("固定投稿のプロンプト組み立て", () => {
  it("配列に直した links を渡せば、誘導先がプロンプトに入る", () => {
    const links = parseProjectLinks(RAW_LINKS).map((l) => ({ type: l.type, label: l.label, url: l.url }));
    const prompt = generateThreadsPrompt({ ...BASE, links } as any);
    expect(prompt).toContain("LINE公式（公式LINE）");
    expect(prompt).toContain("Web予約（Web予約）");
  });

  it("誘導先が未登録でも落ちない", () => {
    const links = parseProjectLinks(null).map((l) => ({ type: l.type, label: l.label, url: l.url }));
    expect(() => generateThreadsPrompt({ ...BASE, links } as any)).not.toThrow();
  });

  it("JSON文字列のまま渡すと落ちる（この形で渡してはいけない）", () => {
    expect(() => generateThreadsPrompt({ ...BASE, links: RAW_LINKS } as any)).toThrow(/find is not a function/);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 自動の答えが「担当者が登録します」のような、だれも行わない約束を書かないようにする（2026-11-03）。
 *   プロンプトで禁じたうえで、出力も調べる。当たったら答えられなかった扱い（confident=false）にして担当者へ回す。
 */
let llmContent: any = null;
vi.mock("./_core/llm", () => ({ invokeLLM: async () => ({ choices: [{ message: { content: JSON.stringify(llmContent) } }] }) }));
vi.mock("./supportCustomerFacts", () => ({ customerFacts: async () => null }));
const recorded: any[] = [];
vi.mock("./db", () => ({ createSupportQuestion: async (q: any) => { recorded.push(q); return 56; } }));

const { answerQuestion, systemPromptFor } = await import("./supportBot");

beforeEach(() => { recorded.length = 0; });

describe("自動の答えの約束文", () => {
  it("「担当者が責任をもって登録させていただきます」は答えられた扱いにしない（担当者へ回る）", async () => {
    llmContent = { answer: "承知いたしました。担当者が責任をもって登録させていただきます。", confident: true, category: "投稿の内容", contentRules: [] };
    const res = await answerQuestion({ question: "運動療法、リハサクをお勧めしたい", userId: 1 });
    expect(res.confident).toBe(false);
    expect(res.unkeptPromise).toBe(true);
    expect(recorded[0].aiConfident).toBe(0);
  });
  it("お客様ご自身の操作のご案内はそのまま答える", async () => {
    llmContent = { answer: "LINEの「設定」から「書き方の決まり」を開くと足せます。", confident: true, category: "LINEの使い方", contentRules: [] };
    const res = await answerQuestion({ question: "書き方の決まりはどこから足せますか", userId: 1 });
    expect(res.confident).toBe(true);
    expect(res.unkeptPromise).toBe(false);
  });
  it("決まりの案（contentRules）を受け取れる。答えが空でも案があれば答えられた扱い", async () => {
    llmContent = { answer: "", confident: true, category: "投稿の内容", contentRules: ["呼びかけの地域は市までにする", " "] };
    const res = await answerQuestion({ question: "呼びかけの質問を町名なしにできますか？", userId: 1 });
    expect(res.contentRules).toEqual(["呼びかけの地域は市までにする"]);
    expect(res.confident).toBe(true);
  });
  it("プロンプトに約束の禁止と、決まりの案の出し方が書いてある", () => {
    const p = systemPromptFor(null);
    expect(p).toContain("担当者が代わりに行うと約束しない");
    expect(p).toContain("「担当者からご連絡します」「担当者におつなぎします」とも書かないでください");
    expect(p).toContain("contentRules に「書き方の決まり」の文を入れてください");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 「運動療法、リハサクをお勧めしたい」（2026-10-13 ご質問 #56 どい接骨院様）は
 * 自動応答に回り、AIが「担当者が責任をもって登録させていただきます」と答えたが、
 * 担当者には届かず、どこにも登録されなかった。
 * 自動応答より先に受け、ネタ帳の「書いてほしい話題」へ足すボタンを出す。
 */
vi.mock("./lineNotify", () => ({ pushLine: vi.fn(), replyLine: vi.fn(), pushLineWithButtons: vi.fn() }));
vi.mock("./supportNotify", () => ({ notifyStaffOfQuestion: vi.fn(async () => true) }));

const askedAi = vi.fn();
vi.mock("./supportBot", () => ({
  answerQuestion: async () => { askedAi(); return { confident: true, available: true, answer: "担当者が責任をもって登録させていただきます。", questionId: 56 }; },
}));

const added: any[] = [];
let ledger: any[] = [];
vi.mock("./materialLedger", () => ({
  listActiveItems: async () => ledger,
  addItems: async (userId: number, projectId: string, items: any[], source: string) => { added.push({ userId, projectId, items, source }); return items.length; },
}));

const LINE_USER = "Utopicpost";
let state: any = null;
let project: any;

vi.mock("./db", () => {
  const impl: Record<string, any> = {
    getUserByLineUserId: async () => ({ id: 1, email: "qa@example.com", name: "QA" }),
    getUserById: async () => ({ id: 1, email: "qa@example.com", name: "QA" }),
    getUserProjects: async () => [project],
    getProjectById: async () => project,
    getLineChatState: async () => state,
    getLineChatStateIgnoringTtl: async () => state,
    setLineChatState: async (_u: string, s: string, d: string) => { state = { state: s, payload: d, ageMin: 0 } as any; },
    clearLineChatState: async () => { state = null; },
    counselingBackupKey: (u: string) => `${u}:counseling_backup`,
    createSupportQuestion: async () => 1,
    updateSupportQuestion: async () => undefined,
  };
  return new Proxy(impl, {
    has: () => true,
    get: (t, k) => (typeof k === "string" && !(k in t) && k !== "then" ? async () => undefined : (t as any)[k]),
  });
});

const handler: any = await import("./lineChatHandler");
const dataOf = (res: any) => JSON.stringify(res);

describe("「〇〇をお勧めしたい」は話題として登録できる（#56）", () => {
  beforeEach(() => {
    state = null; ledger = []; added.length = 0; askedAi.mockClear();
    project = { id: "line_qa1", mode: "store", businessType: "整体院・整骨院", area: "岡山県", storeName: "QA接骨院" };
  });

  it("自動応答に回さず、登録ボタンを出して預かる", async () => {
    const res = await handler.handleFreeText(LINE_USER, "運動療法、リハサクをお勧めしたい");
    expect(askedAi).not.toHaveBeenCalled();
    expect(dataOf(res)).toContain("c=addtopic");
    expect(dataOf(res)).not.toContain("担当者が責任をもって");
    expect(state?.state).toBe("pending_topic");
  });

  it("押すとネタ帳に話題として足す", async () => {
    await handler.handleFreeText(LINE_USER, "運動療法、リハサクをお勧めしたい");
    const res = await handler.handlePostback(LINE_USER, "c=addtopic");
    expect(added).toHaveLength(1);
    expect(added[0].items[0]).toEqual({ kind: "topic", content: "運動療法、リハサクをお勧めしたい" });
    expect(added[0].projectId).toBe("line_qa1");
    expect(dataOf(res)).toContain("話題として登録しました");
    expect(state).toBeNull();
  });

  it("同じ話題が登録済みなら足さない", async () => {
    ledger = [{ id: 1, kind: "topic", content: "運動療法、リハサクをお勧めしたい" }];
    await handler.handleFreeText(LINE_USER, "運動療法、リハサクをお勧めしたい");
    const res = await handler.handlePostback(LINE_USER, "c=addtopic");
    expect(added).toHaveLength(0);
    expect(dataOf(res)).toContain("すでに登録");
  });
});

describe("自動応答の知識にも「話題として登録」がある（#56）", () => {
  it("知識に載っている", async () => {
    const { productKnowledge } = await import("../shared/productKnowledge");
    expect(productKnowledge()).toContain("話題として登録");
  });
  it("代わりに作業すると約束しない決まりがある", async () => {
    const { systemPromptFor } = await vi.importActual<any>("./supportBot");
    expect(systemPromptFor(null)).toContain("担当者が代わりに行うと約束しない");
  });
});

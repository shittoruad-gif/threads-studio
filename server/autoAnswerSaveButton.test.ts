import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 自動応答が「『実績として登録』を押してください」と案内したのに、ボタンが付いていなかった
 * （2026-10-11 ご質問 #55 juria様「初めての方も、安心してどうぞ」）。
 * 12字以上はご質問として自動応答に回るため、短い材料の一文がここに来る。
 * 案内したときは文章を預かってボタンを出す。
 */
vi.mock("./lineNotify", () => ({ pushLine: vi.fn(), replyLine: vi.fn(), pushLineWithButtons: vi.fn() }));
vi.mock("./supportNotify", () => ({ notifyStaffOfQuestion: vi.fn(async () => true) }));

let aiAnswer = "";
vi.mock("./supportBot", () => ({
  answerQuestion: async () => ({ confident: true, available: true, answer: aiAnswer, questionId: 55 }),
}));

const LINE_USER = "Uautoanswersave";
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
  // それ以外の db 関数は「何も無い」を返す（自動応答の前に通る判定がいくつもあるため）
  return new Proxy(impl, {
    has: () => true,
    get: (t, k) => (typeof k === "string" && !(k in t) && k !== "then" ? async () => undefined : (t as any)[k]),
  });
});

const handler: any = await import("./lineChatHandler");
const dataOf = (res: any) => JSON.stringify(res);

describe("自動応答が「実績として登録」を案内したときはボタンを付ける（#55）", () => {
  beforeEach(() => {
    state = null;
    project = { id: "line_qa1", mode: "store", businessType: "エステサロン", area: "岡山県倉敷市", storeName: "QA" };
  });

  it("案内したらボタンが出て、文章を預かる", async () => {
    aiAnswer = "この内容は「お店の情報」として登録できます。このトークに表示される「実績として登録」ボタンを押してください。";
    const res = await handler.handleFreeText(LINE_USER, "初めての方も、安心してどうぞ");
    expect(dataOf(res)).toContain("c=addproof");
    expect(state?.state).toBe("pending_material");
    expect(String(state?.payload)).toContain("初めての方も、安心してどうぞ");
  });

  it("ふつうの答えにはボタンを出さない", async () => {
    aiAnswer = "ログインは、登録したメールアドレスとパスワードで行えます。";
    const res = await handler.handleFreeText(LINE_USER, "ログインはどうすればいいですか？");
    expect(dataOf(res)).not.toContain("c=addproof");
    expect(state).toBe(null);
  });
  it("「お店の情報に登録できます」とだけ答えたときも、言い切りの一文ならボタンを出す（#56）", async () => {
    aiAnswer = "この内容は「お店の情報」に登録して、今後の投稿づくりに役立てることができます。";
    // ★「〇〇をお勧めしたい」そのものは自動応答より先に「話題として登録」へ回る（server/topicPostButton.test.ts）。
    //   ここでは自動応答に回る言い切りの一文で見る
    const res = await handler.handleFreeText(LINE_USER, "運動療法とリハサクに力を入れています");
    expect(dataOf(res)).toContain("c=addproof");
    expect(String(state?.payload)).toContain("運動療法とリハサクに力を入れています");
  });

  it("お店の情報を直したいというお尋ねは預からない", async () => {
    aiAnswer = "メニューの「はじめの設定」から、お店の情報に登録した内容を直せます。";
    const res = await handler.handleFreeText(LINE_USER, "お店の情報の住所を変更したいです");
    expect(dataOf(res)).not.toContain("c=addproof");
    expect(state).toBe(null);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { unwantedTopicWord } from "../shared/requestKind";

/**
 * 「アスリートの話題はいらない」（2026-10-15 ご質問 #57）は自動応答に回り、
 * 「設定からNGワードを登録してください」と説明するだけで、ご登録されないまま
 * 翌朝もその話題の投稿が作られるところだった。言葉を取り出して、その場で登録ボタンを出す。
 */
vi.mock("./lineNotify", () => ({ pushLine: vi.fn(), replyLine: vi.fn(), pushLineWithButtons: vi.fn() }));
vi.mock("./supportNotify", () => ({ notifyStaffOfQuestion: vi.fn(async () => true) }));
const askedAi = vi.fn();
vi.mock("./supportBot", () => ({
  answerQuestion: async () => { askedAi(); return { confident: true, available: true, answer: "NGワードとしてご登録いただけます。", questionId: 57 }; },
}));
const synced: any[] = [];
vi.mock("./counselingSync", () => ({ syncCounselingFromColumns: async (id: string, v: any) => { synced.push({ id, v }); } }));

const LINE_USER = "Uunwantedtopic";
let state: any = null;
let projects: any[] = [];
const updated: any[] = [];
vi.mock("./db", () => {
  const impl: Record<string, any> = {
    getUserByLineUserId: async () => ({ id: 1, email: "qa@example.com", name: "QA" }),
    getUserById: async () => ({ id: 1, email: "qa@example.com", name: "QA" }),
    getUserProjects: async () => projects,
    getProjectsByUserId: async () => projects,
    getProjectById: async (id: string) => projects.find((p) => p.id === id),
    updateProject: async (id: string, v: any) => { updated.push({ id, v }); },
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

describe("unwantedTopicWord", () => {
  it("話題の言葉を取り出す", () => {
    expect(unwantedTopicWord("アスリートの話題はいらない")).toBe("アスリート");
    expect(unwantedTopicWord("ゴルフの話はもういらないです")).toBe("ゴルフ");
    expect(unwantedTopicWord("カッピングの投稿は不要です。")).toBe("カッピング");
  });
  it("設定のご希望・ご質問は拾わない", () => {
    expect(unwantedTopicWord("公開前の確認の投稿はいらない")).toBeNull();
    expect(unwantedTopicWord("朝のまとめの内容はいらない")).toBeNull();
    expect(unwantedTopicWord("同じ話はいらない")).toBeNull();
    expect(unwantedTopicWord("アスリートの話題はいらないですか？")).toBeNull();
    expect(unwantedTopicWord("承認はいらない")).toBeNull();
  });
});

describe("「〇〇の話題はいらない」はその場でNGワードに登録できる（#57）", () => {
  beforeEach(() => {
    state = null; updated.length = 0; synced.length = 0; askedAi.mockClear();
    projects = [{ id: "line_qa1", mode: "store", businessType: "整体院・整骨院", area: "岡山県", storeName: "QA接骨院", ngWords: "必ず" }];
  });
  it("自動応答に回さず、言葉入りの登録ボタンを出す", async () => {
    const res = await handler.handleFreeText(LINE_USER, "アスリートの話題はいらない");
    expect(askedAi).not.toHaveBeenCalled();
    expect(dataOf(res)).toContain(`s=ngadd&w=${encodeURIComponent("アスリート")}`);
    expect(updated).toHaveLength(0); // 押すまでは登録しない
  });
  it("押すと今のNGワードに足して登録する", async () => {
    const res = await handler.handlePostback(LINE_USER, `s=ngadd&w=${encodeURIComponent("アスリート")}`);
    expect(updated).toEqual([{ id: "line_qa1", v: { ngWords: "必ず、アスリート" } }]);
    expect(synced[0].v.ngWords).toBe("必ず、アスリート");
    expect(dataOf(res)).toContain("使わない言葉として登録しました");
  });
  it("お店が2つあれば、どのお店かを選ぶボタンになる", async () => {
    projects.push({ id: "line_qa2", mode: "store", businessType: "整体院・整骨院", area: "岡山県", storeName: "QA2号店", ngWords: null });
    const res = await handler.handleFreeText(LINE_USER, "アスリートの話題はいらない");
    expect(dataOf(res)).toContain("s=ngadd&p=line_qa2");
    await handler.handlePostback(LINE_USER, `s=ngadd&p=line_qa2&w=${encodeURIComponent("アスリート")}`);
    expect(updated).toEqual([{ id: "line_qa2", v: { ngWords: "アスリート" } }]);
  });
});

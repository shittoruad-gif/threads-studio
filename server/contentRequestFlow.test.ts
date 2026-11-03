import { describe, it, expect, vi, beforeEach } from "vitest";
import { OWNER_RULES } from "../shared/ownerRules";
import { CONTENT_RULE_CATEGORY, CONTENT_RULE_HANDLED_BY } from "../shared/contentRequest";

/**
 * 2026-11-03 三上様「そのような問い合わせに対して、自動的にきちんと反映できるようなシステムを組み込んで」。
 * 公式LINEの「〇〇の話題はいらない」「〇〇を勧めたい」を、確認のボタン1つで書き方の決まり（ownerRules）に入れる。
 */
vi.mock("./lineNotify", () => ({ pushLine: vi.fn(), replyLine: vi.fn(), pushLineWithButtons: vi.fn() }));
const notices: any[] = [];
const questionNotices: any[] = [];
vi.mock("./supportNotify", () => ({
  notifyStaffOfQuestion: vi.fn(async (p: any) => { questionNotices.push(p); return true; }),
  notifyStaffOfContentRule: vi.fn(async (p: any) => { notices.push(p); return true; }),
}));
let botAnswer: any = null;
const askedAi = vi.fn();
vi.mock("./supportBot", () => ({
  answerQuestion: async () => { askedAi(); return botAnswer; },
}));
vi.mock("./counselingSync", () => ({ syncCounselingFromColumns: async () => undefined }));

const LINE_USER = "Ucontentrule";
let state: any = null;
let accounts: any[] = [];
let projects: any[] = [];
let questions: Record<number, any> = {};
let nextQid = 100;
const acctUpdates: any[] = [];
const projectUpdates: any[] = [];
vi.mock("./db", () => {
  const impl: Record<string, any> = {
    getUserByLineUserId: async () => ({ id: 1, email: "qa@example.com", name: "QA" }),
    getUserById: async () => ({ id: 1, email: "qa@example.com", name: "QA" }),
    getThreadsAccountsByUserId: async () => accounts,
    getThreadsAccountById: async (id: number) => accounts.find((a) => Number(a.id) === Number(id)),
    updateThreadsAccount: async (id: number, v: any) => {
      acctUpdates.push({ id, v });
      const a = accounts.find((x) => Number(x.id) === Number(id));
      if (a) Object.assign(a, v);
    },
    getUserProjects: async () => projects,
    getProjectsByUserId: async () => projects,
    getProjectById: async (id: string) => projects.find((p) => p.id === id),
    updateProject: async (id: string, v: any) => { projectUpdates.push({ id, v }); },
    getLineChatState: async () => state,
    getLineChatStateIgnoringTtl: async () => state,
    setLineChatState: async (_u: string, s: string, d: string) => { state = { state: s, payload: d ?? null }; },
    clearLineChatState: async () => { state = null; },
    counselingBackupKey: (u: string) => `${u}:counseling_backup`,
    createSupportQuestion: async (q: any) => { const id = nextQid++; questions[id] = { id, ...q }; return id; },
    updateSupportQuestion: async (id: number, v: any) => { questions[id] = { ...(questions[id] ?? { id }), ...v }; },
    getSupportQuestionById: async (id: number) => questions[id] ?? null,
    markSupportQuestionNeedsHuman: async (id: number) => { questions[id] = { ...(questions[id] ?? { id }), needsHuman: 1 }; },
  };
  return new Proxy(impl, {
    has: () => true,
    get: (t, k) => (typeof k === "string" && !(k in t) && k !== "then" ? async () => undefined : (t as any)[k]),
  });
});
const handler: any = await import("./lineChatHandler");
const json = (res: any) => JSON.stringify(res);
const textOf = (res: any) => (res as any[]).map((m) => m.text).join("\n");
const dataList = (res: any): string[] => (res as any[]).flatMap((m) => (m.quickReply?.items ?? []).map((i: any) => i.action?.data));

beforeEach(() => {
  state = null; questions = {}; nextQid = 100; notices.length = 0; questionNotices.length = 0;
  acctUpdates.length = 0; projectUpdates.length = 0; askedAi.mockClear(); botAnswer = null;
  accounts = [{ id: 11, userId: 1, threadsUsername: "qa_clinic", ownerRules: "最後はLINEで締める", isActive: true, defaultProjectId: null }];
  projects = [{ id: "line_qa1", mode: "store", businessType: "整体院・整骨院", area: "岡山県", storeName: "QA接骨院", ngWords: "必ず" }];
});

describe("ご希望を受けたら、決まりの案と3つのボタンを出す（押すまでは入れない）", () => {
  it("「〇〇の話題はいらない」：自動の答えに回さず、確認の文とボタン", async () => {
    const res = await handler.handleFreeText(LINE_USER, "スポーツ選手の話題はいらない");
    expect(askedAi).not.toHaveBeenCalled();
    expect(textOf(res)).toContain("次の決まりとして登録します。よろしいですか。");
    expect(textOf(res)).toContain("「スポーツ選手の話題は書かない」");
    expect(dataList(res)).toEqual(["s=crok&q=100", "s=crfix&q=100", "s=crno&q=100"]);
    expect(acctUpdates).toHaveLength(0);
    expect(questions[100]).toMatchObject({ category: CONTENT_RULE_CATEGORY, needsHuman: 0, question: "スポーツ選手の話題はいらない" });
    expect(notices).toHaveLength(0);
  });

  it("「登録する」で今の決まりの後ろに足す（追記のみ）・NGワードにも足す・記録は自動で対応済み・運営に知らせる", async () => {
    await handler.handleFreeText(LINE_USER, "スポーツ選手の話題はいらない");
    const res = await handler.handlePostback(LINE_USER, "s=crok&q=100");
    expect(acctUpdates).toEqual([{ id: 11, v: { ownerRules: "最後はLINEで締める\nスポーツ選手の話題は書かない" } }]);
    expect(projectUpdates).toEqual([{ id: "line_qa1", v: { ngWords: "必ず、スポーツ選手" } }]);
    expect(textOf(res)).toContain("書き方の決まりに登録しました。明日以降に作る投稿から反映します。");
    expect(textOf(res)).toContain("決まりは「設定」→「書き方の決まり」で見直せます。");
    expect(questions[100].handledBy).toBe(CONTENT_RULE_HANDLED_BY.registered);
    expect(questions[100].handledAt).toBeInstanceOf(Date);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ outcome: "registered", rules: ["スポーツ選手の話題は書かない"], ngWords: ["スポーツ選手"], questionId: 100 });
    expect(state).toBeNull();
  });

  it("待ち状態が切れていても、記録の確認の文から読み戻して登録できる・2回押しても二重に入らない", async () => {
    await handler.handleFreeText(LINE_USER, "運動療法、リハサクをお勧めしたい");
    state = null; // 15分を過ぎた想定
    await handler.handlePostback(LINE_USER, "s=crok&q=100");
    expect(accounts[0].ownerRules).toBe("最後はLINEで締める\n運動療法やリハサクをおすすめする");
    const again = await handler.handlePostback(LINE_USER, "s=crok&q=100");
    expect(textOf(again)).toContain("すでに書き方の決まりに登録しています");
    expect(acctUpdates).toHaveLength(1);
  });

  it("同じ決まりがすでにあれば足さず、そう伝える", async () => {
    accounts[0].ownerRules = "スポーツ選手の話題は書かない";
    await handler.handleFreeText(LINE_USER, "スポーツ選手の話題はいらない");
    const res = await handler.handlePostback(LINE_USER, "s=crok&q=100");
    expect(acctUpdates).toHaveLength(0);
    expect(textOf(res)).toContain("すでに書き方の決まりに入っています");
    expect(questions[100].handledBy).toBe(CONTENT_RULE_HANDLED_BY.registered);
  });

  it("上限なら消さずに上限のご案内・担当者の対応が要る印・運営に知らせる", async () => {
    const full = Array.from({ length: OWNER_RULES.maxRules }, (_, i) => `決まり${i}`).join("\n");
    accounts[0].ownerRules = full;
    await handler.handleFreeText(LINE_USER, "絵文字を減らして");
    const res = await handler.handlePostback(LINE_USER, "s=crok&q=100");
    expect(acctUpdates).toHaveLength(0);
    expect(accounts[0].ownerRules).toBe(full);
    expect(textOf(res)).toContain(`上限の${OWNER_RULES.maxRules}件に達しているため、登録できませんでした`);
    expect(questions[100].needsHuman).toBe(1);
    expect(questions[100].handledAt).toBeUndefined();
    expect(notices[0].outcome).toBe("limit");
  });

  it("「登録しない」：設定は変えず、記録は自動で終了・運営に知らせる", async () => {
    await handler.handleFreeText(LINE_USER, "スポーツ選手の話題はいらない");
    const res = await handler.handlePostback(LINE_USER, "s=crno&q=100");
    expect(acctUpdates).toHaveLength(0);
    expect(projectUpdates).toHaveLength(0);
    expect(textOf(res)).toContain("決まりには登録しません");
    expect(questions[100].handledBy).toBe(CONTENT_RULE_HANDLED_BY.declined);
    expect(notices[0]).toMatchObject({ outcome: "declined", rules: ["スポーツ選手の話題は書かない"] });
  });

  it("「直して登録する」：送られた文をそのまま決まりに入れる", async () => {
    await handler.handleFreeText(LINE_USER, "スポーツ選手の話題はいらない");
    const ask = await handler.handlePostback(LINE_USER, "s=crfix&q=100");
    expect(textOf(ask)).toContain("登録する決まりの文を、短い文で送ってください");
    expect(state?.state).toBe("content_rule_fix");
    const res = await handler.handleFreeText(LINE_USER, "プロ野球やJリーグの選手の話は書かない");
    expect(accounts[0].ownerRules).toBe("最後はLINEで締める\nプロ野球やJリーグの選手の話は書かない");
    expect(textOf(res)).toContain("書き方の決まりに登録しました");
    expect(notices[0]).toMatchObject({ outcome: "registered", edited: true, rules: ["プロ野球やJリーグの選手の話は書かない"] });
    expect(questions[100].handledBy).toBe(CONTENT_RULE_HANDLED_BY.registered);
  });

  it("アカウントが2つなら、どのアカウントかのボタンになり、選んだ方にだけ入る", async () => {
    accounts.push({ id: 12, userId: 1, threadsUsername: "qa_second", ownerRules: null, isActive: true });
    const res = await handler.handleFreeText(LINE_USER, "スポーツ選手の話題はいらない");
    expect(dataList(res)).toEqual(["s=crok&q=100&a=11", "s=crok&q=100&a=12", "s=crfix&q=100", "s=crno&q=100"]);
    expect(textOf(res)).toContain("どのアカウントの決まりにするか");
    await handler.handlePostback(LINE_USER, "s=crok&q=100&a=12");
    expect(acctUpdates).toEqual([{ id: 12, v: { ownerRules: "スポーツ選手の話題は書かない" } }]);
    expect(accounts[0].ownerRules).toBe("最後はLINEで締める");
  });

  it("ほかの方のご希望の記録は使えない", async () => {
    questions[50] = { id: 50, userId: 999, question: "x", aiAnswer: "「スポーツ選手の話題は書かない」" };
    const res = await handler.handlePostback(LINE_USER, "s=crok&q=50");
    expect(acctUpdates).toHaveLength(0);
    expect(textOf(res)).toContain("見つかりませんでした");
  });

  it("ふつうのご質問は今までどおり自動の答えへ", async () => {
    botAnswer = { confident: true, available: true, answer: "固定投稿は「固定投稿を作る」から作れます。", category: "LINEの使い方", questionId: 7, contentRules: [], unkeptPromise: false };
    const res = await handler.handleFreeText(LINE_USER, "固定投稿はどこにある？");
    expect(askedAi).toHaveBeenCalled();
    expect(textOf(res)).toContain("固定投稿は「固定投稿を作る」から作れます。");
    expect(json(res)).not.toContain("s=crok");
  });
});

describe("規則で拾えない言い方は、自動の答えの案を使う／案にできなければ担当者へ", () => {
  it("自動の答えが決まりの案を出したら、確認のボタンを出す（記録は同じ行を使う）", async () => {
    questions[7] = { id: 7, userId: 1, question: "Metaに返答してもらう投稿で、岐阜市でと町名を無くした投稿にできますか？" };
    botAnswer = { confident: true, available: true, answer: "", category: "投稿の内容", questionId: 7, contentRules: ["呼びかけの地域は市までにする（町名は入れない）"], unkeptPromise: false };
    const res = await handler.handleFreeText(LINE_USER, "Metaに返答してもらう投稿で、岐阜市でと町名を無くした投稿にできますか？");
    expect(textOf(res)).toContain("「呼びかけの地域は市までにする（町名は入れない）」");
    expect(dataList(res)[0]).toBe("s=crok&q=7");
    expect(questions[7].category).toBe(CONTENT_RULE_CATEGORY);
  });

  it("ご希望らしいのに案が無ければ、答えだけで終わらせず担当者へ（needsHuman=1・通知）", async () => {
    botAnswer = { confident: true, available: true, answer: "NGワードとしてご登録いただけます。", category: "投稿の内容", questionId: 8, contentRules: [], unkeptPromise: false };
    questions[8] = { id: 8, userId: 1 };
    const res = await handler.handleFreeText(LINE_USER, "絵文字をもう少し減らしてほしいけどできる？");
    expect(questions[8].needsHuman).toBe(1);
    expect(notices[0]).toMatchObject({ outcome: "needs_human", questionId: 8 });
    expect(textOf(res)).toContain("担当者にもお伝えしました");
  });

  it("守る人のいない約束の答え（confident=false にされたもの）は、担当者へ回して通知する", async () => {
    botAnswer = { confident: false, available: true, answer: "担当者が責任をもって登録させていただきます。", category: "投稿の内容", questionId: 9, contentRules: [], unkeptPromise: true };
    questions[9] = { id: 9, userId: 1 };
    const res = await handler.handleFreeText(LINE_USER, "来月から新しく始めるメニューのことを相談したいのですがよろしいでしょうか");
    expect(textOf(res)).not.toContain("責任をもって登録");
    expect(questions[9].needsHuman).toBe(1);
    expect(questionNotices).toHaveLength(1);
  });
});

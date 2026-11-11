import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SETTING_CATEGORY, SETTING_HANDLED_BY, SETTING_ESCALATED_TEXT, UNSTOPPABLE_NOTE } from "../shared/settingRequest";

/**
 * 2026-11-04 三上様「今後、このような問い合わせが来たら、自動的に対応するように変更してください」。
 * 公式LINEの「設定で解決できるお問い合わせ」を、確認のボタン1つで反映する流れ（server/settingRequestFlow.ts）。
 *   判定 → 確認のボタン → 押したら反映 → 三上様へ通知 → supportQuestions を自動で対応済みに。
 * 例の文・URL・アカウント名は一般化してある。
 */
vi.mock("./lineNotify", () => ({ pushLine: vi.fn(), replyLine: vi.fn(), pushLineWithButtons: vi.fn(), pushMessages: vi.fn() }));
const notices: any[] = [];
vi.mock("./supportNotify", () => ({
  notifyStaffOfQuestion: vi.fn(async () => true),
  notifyStaffOfContentRule: vi.fn(async () => true),
  notifyStaffOfSettingRequest: vi.fn(async (p: any) => { notices.push(p); return notifyOk; }),
}));
let notifyOk = true;
let botAnswer: any = null;
const askedAi = vi.fn();
vi.mock("./supportBot", () => ({ answerQuestion: async () => { askedAi(); return botAnswer; } }));
vi.mock("./counselingSync", () => ({ syncCounselingFromColumns: async () => undefined }));

let fetchResult: any = null;
const fetchCalls: string[] = [];
vi.mock("./websitePrefill", () => ({
  fetchWebsite: async (u: string) => { fetchCalls.push(u); return fetchResult; },
  htmlToText: (h: string) => ({ title: "", description: "", text: String(h).replace(/<[^>]+>/g, " ") }),
  extractUrl: () => null,
}));
let ledger: Record<string, Array<{ id: number; content: string }>> = {};
const added: any[] = [];
let addFails = false;
vi.mock("./materialLedger", () => ({
  listActiveItems: async (pid: string) => ledger[pid] ?? [],
  addItems: async (userId: number, pid: string, items: any[], source: string) => {
    if (addFails) throw new Error("db down");
    added.push({ userId, pid, items, source });
    ledger[pid] = [...(ledger[pid] ?? []), ...items.map((i, k) => ({ id: 900 + k, content: i.content }))];
    return items.length;
  },
}));
let llmTopics: string[] = [];
vi.mock("./_core/llm", () => ({ invokeLLM: async () => ({ choices: [{ message: { content: JSON.stringify({ topics: llmTopics }) } }] }) }));
let capState: { cap: number | null; used: number; existing: number[] } = { cap: null, used: 0, existing: [] };
vi.mock("./linePostRequest", () => ({
  dayCapacity: async () => capState,
  openSlotOnDay: async () => null,
  openDays: async () => [],
  notTodayReason: async () => "",
  projectIdForAccount: async () => "line_qa1",
  wantedSlot: async () => ({ ok: false, reason: "（テストでは使わない）" }),
}));

const LINE_USER = "Usettingreq";
const NOW = Date.parse("2026-11-04T10:00:00+09:00");
const at = (s: string) => new Date(Date.parse(`${s}+09:00`));
let state: any = null;
let user: any = {};
let accounts: any[] = [];
let projects: any[] = [];
let posts: any[] = [];
let questions: Record<number, any> = {};
let nextQid = 100;
let plan = "pro";
let newsletter: { optedOut: boolean; note: string | null } = { optedOut: false, note: null };
const flagCalls: any[] = [];
const acctUpdates: any[] = [];
const postUpdates: any[] = [];
const emailCalls: any[] = [];
const autoSettings: any[] = [];
const nlCalls: any[] = [];
vi.mock("./db", () => {
  const impl: Record<string, any> = {
    getUserByLineUserId: async () => ({ id: 1, ...user }),
    getUserById: async (id: number) => (id === 1 ? { id: 1, email: "qa@example.com", name: "QA", ...user } : null),
    getSubscriptionByUserId: async () => ({ planId: plan, status: "active" }),
    getThreadsAccountsByUserId: async (uid: number) => accounts.filter((a) => a.userId === uid),
    getThreadsAccountById: async (id: number) => accounts.find((a) => Number(a.id) === Number(id)),
    updateThreadsAccount: async (id: number, v: any) => { acctUpdates.push({ id, v }); const a = accounts.find((x) => Number(x.id) === Number(id)); if (a) Object.assign(a, v); },
    getUserProjects: async () => projects,
    getProjectsByUserId: async () => projects,
    getLineChatState: async () => state,
    getLineChatStateIgnoringTtl: async () => state,
    setLineChatState: async (_u: string, s: string, d: string) => { state = { state: s, payload: d ?? null }; },
    clearLineChatState: async () => { state = null; },
    counselingBackupKey: (u: string) => `${u}:counseling_backup`,
    createSupportQuestion: async (q: any) => { const id = nextQid++; questions[id] = { id, ...q }; return id; },
    updateSupportQuestion: async (id: number, v: any) => { questions[id] = { ...(questions[id] ?? { id }), ...v }; },
    getSupportQuestionById: async (id: number) => questions[id] ?? null,
    setUserNoticeFlag: async (uid: number, col: string, on: boolean) => { flagCalls.push({ uid, col, on }); user[col] = on ? 1 : 0; },
    setEmailOptOut: async (uid: number, v: boolean) => { emailCalls.push({ uid, v }); user.emailOptOut = v ? 1 : 0; },
    updateAutoPostSettings: async (uid: number, v: any) => { autoSettings.push({ uid, v }); Object.assign(user, v); },
    getNewsletterOptOut: async () => newsletter,
    setNewsletterOptOut: async (uid: number, optOut: boolean) => {
      nlCalls.push({ uid, optOut });
      if (!optOut && newsletter.optedOut && newsletter.note !== "ご本人がLINEで停止") return { changed: false, blocked: true };
      newsletter = optOut ? { optedOut: true, note: "ご本人がLINEで停止" } : { optedOut: false, note: null };
      return { changed: true, blocked: false };
    },
    listMovablePosts: async (uid: number, from: Date, to: Date) => posts
      .filter((p) => p.userId === uid && (p.status === "pending" || p.status === "awaiting_approval") && p.scheduledAt >= from && p.scheduledAt <= to)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()),
    getScheduledPostById: async (id: number) => posts.find((p) => p.id === id),
    updateScheduledPost: async (id: number, v: any) => { postUpdates.push({ id, v }); const p = posts.find((x) => x.id === id); if (p) Object.assign(p, v); },
    getAccountSlotTimesOnDate: async (aid: number, ymd: string, exclude: number | null) => posts
      .filter((p) => p.threadsAccountId === aid && p.id !== exclude && new Date(p.scheduledAt.getTime() + 9 * 3600_000).toISOString().slice(0, 10) === ymd)
      .map((p) => p.scheduledAt),
    isNextActionNotifyEnabled: async () => user.nextActionNotifyEnabled !== 0,
    getAutoPostSettings: async () => ({ autoPostEnabled: true, autoPostRequireApproval: false, postLength: "short", metaAiAskEnabled: true, autoPostFrequency: user.autoPostFrequency ?? "three_daily" }),
  };
  return new Proxy(impl, {
    has: () => true,
    get: (t, k) => (typeof k === "string" && !(k in t) && k !== "then" ? async () => undefined : (t as any)[k]),
  });
});
const handler: any = await import("./lineChatHandler");
const textOf = (res: any) => (res as any[]).map((m) => m.text).join("\n");
const dataList = (res: any): string[] => (res as any[]).flatMap((m) => (m.quickReply?.items ?? []).map((i: any) => i.action?.data));
const labels = (res: any): string[] => (res as any[]).flatMap((m) => (m.quickReply?.items ?? []).map((i: any) => i.action?.label));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state = null; questions = {}; nextQid = 100; notices.length = 0; askedAi.mockClear(); botAnswer = null; notifyOk = true;
  user = { dailyResultNotifyEnabled: 1, nextActionNotifyEnabled: 1, engagementCoachEnabled: 1, metaAiAskEnabled: true, emailOptOut: 0 };
  accounts = [{ id: 11, userId: 1, threadsUsername: "qa_clinic", isActive: true, fixedPostHours: null }];
  projects = [{ id: "line_qa1", mode: "store", businessType: "整体院・整骨院", area: "岡山県", storeName: "QA整体院", ngWords: "" }];
  posts = [];
  plan = "pro"; newsletter = { optedOut: false, note: null };
  flagCalls.length = 0; acctUpdates.length = 0; postUpdates.length = 0; emailCalls.length = 0; autoSettings.length = 0; nlCalls.length = 0;
  fetchResult = null; fetchCalls.length = 0; ledger = {}; added.length = 0; addFails = false; llmTopics = [];
  capState = { cap: null, used: 0, existing: [] };
});
afterEach(() => { vi.useRealTimers(); });

// ═══════════════════ 1. 通知 ═══════════════════
describe("1. 通知を止めたい：確認 → 押したら止める", () => {
  it("「投稿結果を送らないで欲しい」：自動の答えに回さず、確認の文と［止める］［止めない］。押すまでは変えない", async () => {
    const res = await handler.handleFreeText(LINE_USER, "投稿結果を送らないで欲しい");
    expect(askedAi).not.toHaveBeenCalled();
    expect(textOf(res)).toContain("朝のまとめの「昨日の投稿結果」を止めます。よろしいですか。");
    expect(textOf(res)).toContain(UNSTOPPABLE_NOTE);
    expect(dataList(res)).toEqual(["s=ntok&q=100&k=dr&v=off", "s=ntno&q=100"]);
    expect(labels(res)).toEqual(["止める", "止めない"]);
    expect(flagCalls).toHaveLength(0);
    expect(questions[100]).toMatchObject({ category: SETTING_CATEGORY.notice, needsHuman: 0, question: "投稿結果を送らないで欲しい" });
    expect(questions[100].handledAt).toBeUndefined();
    expect(notices).toHaveLength(0);
  });

  it("［止める］で止める・記録は自動で対応済み・三上様へ知らせる・［元に戻す］が付く", async () => {
    await handler.handleFreeText(LINE_USER, "投稿結果を送らないで欲しい");
    const res = await handler.handlePostback(LINE_USER, "s=ntok&q=100&k=dr&v=off");
    expect(flagCalls).toEqual([{ uid: 1, col: "dailyResultNotifyEnabled", on: false }]);
    expect(textOf(res)).toContain("朝のまとめの「昨日の投稿結果」を止めました。");
    expect(dataList(res)).toContain("s=ntset&k=dr&v=on");
    expect(questions[100].handledBy).toBe(SETTING_HANDLED_BY.noticeOff);
    expect(questions[100].handledAt).toBeInstanceOf(Date);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "notice", outcome: "applied", questionId: 100, question: "投稿結果を送らないで欲しい" });
    expect(notices[0].details[0]).toContain("止めました");
    // 三上様への1通に、押したボタンとお客様へ実際に送った文が入る
    expect(notices[0].pressed).toBe("止める");
    expect(notices[0].reply).toBe(textOf(res));
  });

  it("2回押しても二重に変えない", async () => {
    await handler.handleFreeText(LINE_USER, "投稿結果を送らないで欲しい");
    await handler.handlePostback(LINE_USER, "s=ntok&q=100&k=dr&v=off");
    const again = await handler.handlePostback(LINE_USER, "s=ntok&q=100&k=dr&v=off");
    expect(textOf(again)).toContain("すでに止めています");
    expect(flagCalls).toHaveLength(1);
    expect(notices).toHaveLength(1);
  });

  it("［止めない］なら変えない・見送りとして記録・知らせる", async () => {
    await handler.handleFreeText(LINE_USER, "交流の案内はいらない");
    const res = await handler.handlePostback(LINE_USER, "s=ntno&q=100");
    expect(flagCalls).toHaveLength(0);
    expect(textOf(res)).toContain("今のままにします");
    expect(questions[100].handledBy).toBe(SETTING_HANDLED_BY.declined);
    expect(notices[0]).toMatchObject({ kind: "notice", outcome: "declined" });
  });

  it("「朝のお知らせはいらない」は昨日の投稿結果と次にやることの2つ", async () => {
    const res = await handler.handleFreeText(LINE_USER, "朝のお知らせはいらない");
    expect(dataList(res)[0]).toBe("s=ntok&q=100&k=dr.na&v=off");
    await handler.handlePostback(LINE_USER, "s=ntok&q=100&k=dr.na&v=off");
    expect(flagCalls.map((c) => c.col)).toEqual(["dailyResultNotifyEnabled", "nextActionNotifyEnabled"]);
  });

  it("すでに止めている通知は、止める確認を出さずにそう伝える", async () => {
    user.engagementCoachEnabled = 0;
    const res = await handler.handleFreeText(LINE_USER, "交流の案内はいらない");
    expect(textOf(res)).toContain("すでに止めています");
    expect(dataList(res).some((d) => d.startsWith("s=ntok"))).toBe(false);
    expect(questions[100].handledBy).toBe(SETTING_HANDLED_BY.noticeOff);
  });

  it("「また送って」で戻す（止めていた分だけ）", async () => {
    user.dailyResultNotifyEnabled = 0;
    const res = await handler.handleFreeText(LINE_USER, "投稿結果をまた送ってほしい");
    expect(textOf(res)).toContain("また受け取るようにします。よろしいですか。");
    expect(dataList(res)[0]).toBe("s=ntok&q=100&k=dr&v=on");
    const done = await handler.handlePostback(LINE_USER, "s=ntok&q=100&k=dr&v=on");
    expect(flagCalls).toEqual([{ uid: 1, col: "dailyResultNotifyEnabled", on: true }]);
    expect(textOf(done)).toContain("また受け取るようにしました");
    expect(questions[100].handledBy).toBe(SETTING_HANDLED_BY.noticeOn);
  });

  it("承認カードは止められない：ご案内だけ・設定は変えない", async () => {
    const res = await handler.handleFreeText(LINE_USER, "承認カードはいらない");
    expect(textOf(res)).toContain(UNSTOPPABLE_NOTE);
    expect(dataList(res)).toContain("s=notif");
    expect(flagCalls).toHaveLength(0);
    expect(notices[0]).toMatchObject({ outcome: "info" });
  });

  it("どの通知か分からない「LINEの通知はいらない」は、お知らせの受け取りの一覧（1つずつ止められる）", async () => {
    const res = await handler.handleFreeText(LINE_USER, "LINEの通知はいらない");
    expect(textOf(res)).toContain("どのお知らせを止めますか");
    expect(dataList(res)).toContain("s=ntset&k=dr&v=off");
    expect(dataList(res)).toContain("s=ntset&k=ec&v=off");
    expect(flagCalls).toHaveLength(0);
  });

  it("担当者が止めた読み物は、ご本人の「戻して」では消さずに担当者へ", async () => {
    newsletter = { optedOut: true, note: "担当者が入れた" };
    await handler.handleFreeText(LINE_USER, "読み物をまた送ってほしい");
    const res = await handler.handlePostback(LINE_USER, "s=ntok&q=100&k=nl&v=on");
    expect(textOf(res)).toContain("担当者の設定で止めています");
    expect(newsletter.optedOut).toBe(true);
    expect(notices.at(-1)).toMatchObject({ outcome: "needs_human" });
    expect(questions[100].needsHuman).toBe(1);
  });

  it("Meta AI呼びかけはライトプランでは戻せない（理由を返す）", async () => {
    plan = "light"; user.metaAiAskEnabled = false;
    await handler.handleFreeText(LINE_USER, "Meta AIの呼びかけ投稿を再開してください");
    const res = await handler.handlePostback(LINE_USER, "s=ntok&q=100&k=ma&v=on");
    expect(textOf(res)).toContain("プロプラン・ビジネスプランで使えます");
    expect(autoSettings).toHaveLength(0);
  });

  it("ほかのお客様のご依頼のボタンでは、何も変えない", async () => {
    questions[555] = { id: 555, userId: 2, question: "投稿結果を送らないで" };
    const res = await handler.handlePostback(LINE_USER, "s=ntok&q=555&k=dr&v=off");
    expect(textOf(res)).toContain("見つかりませんでした");
    expect(flagCalls).toHaveLength(0);
    expect(questions[555].handledAt).toBeUndefined();
  });

  it("「設定」に「お知らせの受け取り」があり、止めた通知を戻すボタンが出る", async () => {
    user.dailyResultNotifyEnabled = 0;
    const settings = await handler.handlePostback(LINE_USER, "m=settings");
    expect(dataList(settings)).toContain("s=notif");
    const menu = await handler.handlePostback(LINE_USER, "s=notif");
    expect(textOf(menu)).toContain("朝のまとめの「昨日の投稿結果」：止めている");
    expect(labels(menu)).toContain("戻す：昨日の投稿結果");
    const back = await handler.handlePostback(LINE_USER, "s=ntset&k=dr&v=on");
    expect(flagCalls).toEqual([{ uid: 1, col: "dailyResultNotifyEnabled", on: true }]);
    expect(textOf(back)).toContain("また受け取るようにしました");
  });
});

// ═══════════════════ 2. ホームページから話題 ═══════════════════
const PAGE = `<html><body><nav><h2>ホーム</h2></nav>
  <h2>肩こりと姿勢のくせ</h2><h2>腰痛でお悩みの方へ</h2><h3>心の不調とからだの関係</h3>
  <h3>ヘルニアを根本から治す施術</h3><h2>産後の骨盤まわり</h2><h2>デスクワークの首こり</h2>
  <h2>猫背と呼吸</h2><h2>冷えとむくみ</h2><h2>料金</h2></body></html>`;
const URL_TEXT = "https://example.com/trouble/\n\nこのHPの内容を元に記事を作成できないでしょうか？";

describe("2. ホームページのURL＋「これを元に投稿を」", () => {
  it("ページを読み、話題を最大5件に整えて［この話題を登録する］［登録しない］。健康の決まりに触れやすい話題は外す", async () => {
    fetchResult = { ok: true, url: "https://example.com/trouble/", html: PAGE };
    const res = await handler.handleFreeText(LINE_USER, URL_TEXT);
    expect(askedAi).not.toHaveBeenCalled();
    expect(fetchCalls).toEqual(["https://example.com/trouble/"]);
    const t = textOf(res);
    expect(t).toContain("次の5件をネタ帳に登録します。よろしいですか。");
    for (const x of ["肩こりと姿勢のくせ", "腰痛でお悩みの方へ", "産後の骨盤まわり", "デスクワークの首こり", "猫背と呼吸"]) expect(t).toContain(`「${x}」`);
    expect(t).not.toContain("心の不調");
    expect(t).not.toContain("ヘルニア");
    expect(t).toContain("健康の広告の決まりに触れやすい話題（2件）は外しました。");
    expect(dataList(res)).toEqual(["s=tpok&q=100", "s=tpno&q=100"]);
    expect(added).toHaveLength(0);
    expect(questions[100]).toMatchObject({ category: SETTING_CATEGORY.topics, needsHuman: 0 });
  });

  it("［この話題を登録する］でネタ帳の「書いてほしい話題」に足す・対応済み・知らせる・2回押しても二重に入らない", async () => {
    fetchResult = { ok: true, url: "https://example.com/trouble/", html: PAGE };
    await handler.handleFreeText(LINE_USER, URL_TEXT);
    const res = await handler.handlePostback(LINE_USER, "s=tpok&q=100");
    expect(added).toHaveLength(1);
    expect(added[0].pid).toBe("line_qa1");
    expect(added[0].items.every((i: any) => i.kind === "topic")).toBe(true);
    expect(added[0].items).toHaveLength(5);
    expect(textOf(res)).toContain("ネタ帳の「書いてほしい話題」に5件登録しました。");
    expect(questions[100].handledBy).toBe(SETTING_HANDLED_BY.topics);
    expect(notices[0]).toMatchObject({ kind: "topics", outcome: "applied", questionId: 100 });
    expect(state).toBeNull();
    const again = await handler.handlePostback(LINE_USER, "s=tpok&q=100");
    expect(textOf(again)).toContain("すでにネタ帳に登録しています");
    expect(added).toHaveLength(1);
  });

  it("預かりが切れていても、確認の文から読み戻して登録できる", async () => {
    fetchResult = { ok: true, url: "https://example.com/trouble/", html: PAGE };
    await handler.handleFreeText(LINE_USER, URL_TEXT);
    state = null;
    await handler.handlePostback(LINE_USER, "s=tpok&q=100");
    expect(added[0].items.map((i: any) => i.content)).toEqual(["肩こりと姿勢のくせ", "腰痛でお悩みの方へ", "産後の骨盤まわり", "デスクワークの首こり", "猫背と呼吸"]);
  });

  it("ページを読めないときは三上様へ回す（設定は変えない）", async () => {
    fetchResult = { ok: false, reason: "ページが開けませんでした（404）" };
    const res = await handler.handleFreeText(LINE_USER, URL_TEXT);
    expect(textOf(res)).toContain("読み取れませんでした（ページが開けませんでした（404））");
    expect(textOf(res)).toContain(SETTING_ESCALATED_TEXT);
    expect(questions[100].needsHuman).toBe(1);
    expect(notices[0]).toMatchObject({ kind: "topics", outcome: "needs_human" });
    expect(added).toHaveLength(0);
  });

  it("見出しが無いページは本文から書き出し、同じ決まりで外す", async () => {
    fetchResult = { ok: true, url: "https://example.com/a", html: `<p>${"からだのことを丁寧にお伝えしています。".repeat(10)}</p>` };
    llmTopics = ["肩こりと姿勢", "うつと自律神経", "季節の冷え対策"];
    const res = await handler.handleFreeText(LINE_USER, "https://example.com/a このページを参考に投稿を作ってください");
    expect(textOf(res)).toContain("「肩こりと姿勢」");
    expect(textOf(res)).toContain("「季節の冷え対策」");
    expect(textOf(res)).not.toContain("うつ");
  });

  it("［登録しない］なら入れない・見送りとして知らせる", async () => {
    fetchResult = { ok: true, url: "https://example.com/trouble/", html: PAGE };
    await handler.handleFreeText(LINE_USER, URL_TEXT);
    const res = await handler.handlePostback(LINE_USER, "s=tpno&q=100");
    expect(added).toHaveLength(0);
    expect(textOf(res)).toContain("ネタ帳には登録しません");
    expect(notices[0]).toMatchObject({ outcome: "declined" });
  });

  it("登録に失敗したら三上様へ回す", async () => {
    fetchResult = { ok: true, url: "https://example.com/trouble/", html: PAGE };
    await handler.handleFreeText(LINE_USER, URL_TEXT);
    addFails = true;
    const res = await handler.handlePostback(LINE_USER, "s=tpok&q=100");
    expect(textOf(res)).toContain("うまくいきませんでした");
    expect(questions[100].needsHuman).toBe(1);
    expect(questions[100].handledAt).toBeUndefined();
    expect(notices.at(-1)).toMatchObject({ outcome: "needs_human" });
  });

  it("お店の情報がまだの方は、今までどおり（ページを読みに行かない）", async () => {
    projects = [];
    botAnswer = { confident: true, available: true, answer: "はい。", category: "投稿の内容", questionId: 7, contentRules: [], unkeptPromise: false, settingRequest: "none" };
    await handler.handleFreeText(LINE_USER, URL_TEXT);
    expect(fetchCalls).toHaveLength(0);
  });
});

// ═══════════════════ 3. 投稿の時刻 ═══════════════════
describe("3. これからの自動投稿の時刻（fixedPostHours）", () => {
  it("「自動は12時に。3回になったら12時と15時」：確認 → 押したら 12,15 に決める・元に戻すが付く", async () => {
    const res = await handler.handleFreeText(LINE_USER, "自動は12時に。3回になったら12時と15時");
    expect(textOf(res)).toContain("これからの自動投稿の時刻を「12:00、15:00」に決めます。よろしいですか。");
    expect(dataList(res)).toEqual(["s=fhok&q=100&a=11&h=12.15", "s=fhno&q=100"]);
    expect(acctUpdates).toHaveLength(0);
    const done = await handler.handlePostback(LINE_USER, "s=fhok&q=100&a=11&h=12.15");
    expect(acctUpdates).toEqual([{ id: 11, v: { fixedPostHours: "12,15" } }]);
    expect(textOf(done)).toContain("「12:00、15:00」に決めました");
    expect(dataList(done)).toContain("s=fhset&a=11&h=none");
    expect(questions[100]).toMatchObject({ handledBy: SETTING_HANDLED_BY.fixedHours, category: SETTING_CATEGORY.postTime });
    expect(notices[0]).toMatchObject({ kind: "post_time", outcome: "applied" });
    // 二度押し
    await handler.handlePostback(LINE_USER, "s=fhok&q=100&a=11&h=12.15");
    expect(acctUpdates).toHaveLength(1);
    // 元に戻す
    await handler.handlePostback(LINE_USER, "s=fhset&a=11&h=none");
    expect(acctUpdates[1]).toEqual({ id: 11, v: { fixedPostHours: null } });
  });

  it("アカウントが2つなら選ぶ。押したアカウントだけ変え、ほかのお客様のアカウントには触れない", async () => {
    accounts.push({ id: 12, userId: 1, threadsUsername: "qa_second", isActive: true, fixedPostHours: null });
    accounts.push({ id: 99, userId: 2, threadsUsername: "other_shop", isActive: true, fixedPostHours: null });
    const res = await handler.handleFreeText(LINE_USER, "自動は12時にしてほしい");
    expect(dataList(res)).toEqual(["s=fhok&q=100&a=11&h=12", "s=fhok&q=100&a=12&h=12", "s=fhok&q=100&a=all&h=12", "s=fhno&q=100"]);
    await handler.handlePostback(LINE_USER, "s=fhok&q=100&a=99&h=12");
    expect(acctUpdates).toHaveLength(0);
    await handler.handlePostback(LINE_USER, "s=fhok&q=100&a=all&h=12");
    expect(acctUpdates.map((u) => u.id)).toEqual([11, 12]);
  });

  it("すでにその時刻なら変えずにそう伝える", async () => {
    accounts[0].fixedPostHours = "12";
    const res = await handler.handleFreeText(LINE_USER, "自動は12時にしてほしい");
    expect(textOf(res)).toContain("すでに「12:00」に決まっています");
    expect(dataList(res).some((d) => d.startsWith("s=fhok"))).toBe(false);
  });
});

describe("3. 予約済みの投稿の時刻を動かす", () => {
  it("「５日(木)12:00にお願いします」（本文なし）：5日の予約を12:00に動かす確認。Zoomとは取り違えず、［ちがう］も出す", async () => {
    posts = [{ id: 501, userId: 1, threadsAccountId: 11, status: "pending", source: "auto", scheduledAt: at("2026-11-05T21:07:00"), postContent: "今日は肩まわりの話です。" }];
    const res = await handler.handleFreeText(LINE_USER, "５日(木)12:00にお願いします");
    expect(askedAi).not.toHaveBeenCalled();
    const t = textOf(res);
    expect(t).toContain("11/5（木）21:07 に予約している投稿を、11/5（木）12:00 に動かします。よろしいですか。");
    expect(t).not.toMatch(/Zoom希望/);
    expect(dataList(res)).toEqual(["s=mvok&q=100&i=501&t=202611051200", "s=mvno&q=100", "s=stno&q=100"]);
    expect(postUpdates).toHaveLength(0);
    const done = await handler.handlePostback(LINE_USER, "s=mvok&q=100&i=501&t=202611051200");
    expect(postUpdates).toEqual([{ id: 501, v: { scheduledAt: at("2026-11-05T12:00:00") } }]);
    expect(textOf(done)).toContain("11/5（木）12:00 に動かしました。文章はそのままです。");
    expect(dataList(done)).toContain("s=mvset&i=501&t=202611052107");
    expect(questions[100].handledBy).toBe(SETTING_HANDLED_BY.movePost);
    expect(notices[0]).toMatchObject({ kind: "post_time", outcome: "applied" });
    expect(notices[0].details[0]).toContain("11/5（木）21:07 → 11/5（木）12:00");
    // 二度押し
    await handler.handlePostback(LINE_USER, "s=mvok&q=100&i=501&t=202611051200");
    expect(postUpdates).toHaveLength(1);
  });

  it("ご自身で決めた投稿（manual）を動かすときは、そう書いて確認する", async () => {
    posts = [{ id: 502, userId: 1, threadsAccountId: 11, status: "pending", source: "manual", approvedVia: "line_post", scheduledAt: at("2026-11-05T15:00:00"), postContent: "臨時休業のお知らせです。" }];
    const res = await handler.handleFreeText(LINE_USER, "15時の予約を12時に変えて");
    expect(textOf(res)).toContain("ご自身で決めて予約した投稿です");
    expect(dataList(res)[0]).toBe("s=mvok&q=100&i=502&t=202611051200");
  });

  it("「15:00で予約になっているものを12:00に」：同じ時刻の予約が2アカウントにあれば、押した1件だけを動かす", async () => {
    accounts.push({ id: 12, userId: 1, threadsUsername: "qa_second", isActive: true });
    posts = [
      { id: 601, userId: 1, threadsAccountId: 11, status: "pending", source: "auto", scheduledAt: at("2026-11-05T15:12:00"), postContent: "一つ目" },
      { id: 602, userId: 1, threadsAccountId: 12, status: "awaiting_approval", source: "auto", scheduledAt: at("2026-11-05T15:20:00"), postContent: "二つ目" },
      { id: 603, userId: 1, threadsAccountId: 11, status: "pending", source: "auto", scheduledAt: at("2026-11-06T15:05:00"), postContent: "翌日" },
    ];
    const res = await handler.handleFreeText(LINE_USER, "15:00で予約になっているものを12:00にしてください");
    expect(textOf(res)).toContain("予約している投稿が2件あります");
    expect(labels(res).slice(0, 2)).toEqual(["①を12:00に", "②を12:00に"]);
    expect(dataList(res).slice(0, 2)).toEqual(["s=mvok&q=100&i=601&t=202611051200", "s=mvok&q=100&i=602&t=202611051200"]);
    await handler.handlePostback(LINE_USER, "s=mvok&q=100&i=602&t=202611051200");
    expect(postUpdates.map((u) => u.id)).toEqual([602]);
  });

  it("もう過ぎた時刻には動かさず、理由を返す", async () => {
    posts = [{ id: 701, userId: 1, threadsAccountId: 11, status: "pending", source: "auto", scheduledAt: at("2026-11-04T21:00:00"), postContent: "今夜の投稿" }];
    const res = await handler.handleFreeText(LINE_USER, "今日の投稿を9時にして");
    expect(textOf(res)).toContain("もう過ぎているか間に合わないため、動かせませんでした");
    expect(dataList(res).some((d) => d.startsWith("s=mvok"))).toBe(false);
    expect(postUpdates).toHaveLength(0);
  });

  it("同じアカウントの別の投稿のすぐ近くには動かさない", async () => {
    posts = [
      { id: 801, userId: 1, threadsAccountId: 11, status: "pending", source: "auto", scheduledAt: at("2026-11-05T21:00:00"), postContent: "夜" },
      { id: 802, userId: 1, threadsAccountId: 11, status: "posted", source: "auto", scheduledAt: at("2026-11-05T12:10:00"), postContent: "昼" },
    ];
    const res = await handler.handleFreeText(LINE_USER, "明日の投稿を12時にして");
    expect(textOf(res)).toContain("近くに、同じアカウントの別の投稿が入っています");
    expect(postUpdates).toHaveLength(0);
  });

  it("その日の本数の上限に当たる日へは動かさない（元に戻すのボタンでも確かめる）", async () => {
    posts = [{ id: 901, userId: 1, threadsAccountId: 11, status: "pending", source: "auto", scheduledAt: at("2026-11-05T21:00:00"), postContent: "夜" }];
    capState = { cap: 1, used: 1, existing: [] };
    const res = await handler.handlePostback(LINE_USER, "s=mvset&i=901&t=202611061200");
    expect(textOf(res)).toContain("いまは1日1件までのため、この日には動かせませんでした");
    expect(postUpdates).toHaveLength(0);
  });

  it("ほかのお客様の投稿は動かせない", async () => {
    posts = [{ id: 950, userId: 2, threadsAccountId: 99, status: "pending", source: "auto", scheduledAt: at("2026-11-05T21:00:00"), postContent: "よそ" }];
    questions[100] = { id: 100, userId: 1, question: "明日の投稿を12時に" };
    const res = await handler.handlePostback(LINE_USER, "s=mvok&q=100&i=950&t=202611051200");
    expect(textOf(res)).toContain("その投稿が見つかりませんでした");
    expect(postUpdates).toHaveLength(0);
  });

  it("その日に予約が無ければ「毎日12時にする」を選べる・［ちがう］なら担当者へ", async () => {
    const res = await handler.handleFreeText(LINE_USER, "５日(木)12:00にお願いします");
    expect(textOf(res)).toContain("11/05 に予約している投稿は、まだありません");
    expect(dataList(res)).toEqual(["s=fhok&q=100&h=12&a=11", "s=mvno&q=100", "s=stno&q=100"]);
    const no = await handler.handlePostback(LINE_USER, "s=stno&q=100");
    expect(textOf(no)).toContain("担当者にお伝えしました");
    expect(questions[100].needsHuman).toBe(1);
    expect(notices.at(-1)).toMatchObject({ kind: "post_time", outcome: "needs_human" });
    expect(acctUpdates).toHaveLength(0);
  });

  it("「15時の予約」が見つからなければ三上様へ回す", async () => {
    const res = await handler.handleFreeText(LINE_USER, "15時の予約を12時に変えて");
    expect(textOf(res)).toContain("15:00ごろに予約している投稿が見つかりませんでした");
    expect(questions[100].needsHuman).toBe(1);
    expect(notices[0]).toMatchObject({ outcome: "needs_human" });
  });

  it("［動かさない］なら変えない", async () => {
    posts = [{ id: 501, userId: 1, threadsAccountId: 11, status: "pending", source: "auto", scheduledAt: at("2026-11-05T21:07:00"), postContent: "本文" }];
    await handler.handleFreeText(LINE_USER, "明日の投稿を12時にして");
    await handler.handlePostback(LINE_USER, "s=mvno&q=100");
    expect(postUpdates).toHaveLength(0);
    expect(questions[100].handledBy).toBe(SETTING_HANDLED_BY.declined);
  });

  it("本文つきのご依頼は、送られた文章の予約の流れのまま（時刻の確認は出さない）", async () => {
    const res = await handler.handleFreeText(LINE_USER, "明日の12時にこの投稿をお願いします\n今月の営業日のお知らせです。11日は臨時でお休みをいただきます。");
    expect(dataList(res).some((d) => /^s=(mvok|fhok)/.test(d))).toBe(false);
    expect(Object.values(questions).some((q: any) => q.category === SETTING_CATEGORY.postTime)).toBe(false);
  });
});

// ═══════════════════ 4. 自動の答え（supportBot） ═══════════════════
describe("4. 自動の答えが設定のご希望と読んだら、答えで終わらせず担当者へ", () => {
  it("規則で拾えない言い方でも、settingRequest が付いたら担当者へ回す（needsHuman=1・三上様へ通知）", async () => {
    botAnswer = { confident: true, available: true, answer: "", category: "要望", questionId: 300, contentRules: [], unkeptPromise: false, settingRequest: "notice" };
    questions[300] = { id: 300, userId: 1, question: "毎朝の数字のやつ、うちは見ないので静かにしてもらえると助かります" };
    const res = await handler.handleFreeText(LINE_USER, "毎朝の数字のやつ、うちは見ないので静かにしてもらえると助かります");
    expect(askedAi).toHaveBeenCalled();
    expect(textOf(res)).toContain(SETTING_ESCALATED_TEXT);
    expect(questions[300]).toMatchObject({ needsHuman: 1, category: SETTING_CATEGORY.notice });
    expect(notices[0]).toMatchObject({ kind: "notice", outcome: "needs_human", questionId: 300 });
    expect(flagCalls).toHaveLength(0);
  });

  it("ふつうのご質問は今まで通り答える", async () => {
    botAnswer = { confident: true, available: true, answer: "固定投稿は「固定投稿を作る」から作れます。", category: "LINEの使い方", questionId: 7, contentRules: [], unkeptPromise: false, settingRequest: "none" };
    const res = await handler.handleFreeText(LINE_USER, "固定投稿はどこにある？");
    expect(textOf(res)).toContain("固定投稿は「固定投稿を作る」から作れます。");
    expect(notices).toHaveLength(0);
  });

  it("通知が送れないときは「担当者に聞く」へ", async () => {
    notifyOk = false;
    botAnswer = { confident: true, available: true, answer: "", category: "要望", questionId: 301, contentRules: [], unkeptPromise: false, settingRequest: "post_time" };
    questions[301] = { id: 301, userId: 1 };
    const res = await handler.handleFreeText(LINE_USER, "投稿の出る時間帯をもう少し早めにしてほしいです");
    expect(textOf(res)).toContain("「担当者に聞く」を押してから");
    expect(dataList(res)[0]).toBe("m=staff&q=301");
  });
});

// ═══════════════════ 5. 1日の回数（2026-11-11 ご質問 #73） ═══════════════════
describe("5. 1日の回数：確認 → 押したら変える", () => {
  const Q73 = "・自動投稿：ON・1日3回（共通）を\n1日1回の個別設定に変更して下さい";
  const two = () => {
    accounts = [
      { id: 11, userId: 1, threadsUsername: "qa_a", isActive: true, autoPostFrequency: null },
      { id: 12, userId: 1, threadsUsername: "qa_b", isActive: true, autoPostFrequency: null },
    ];
  };

  it("ご質問 #73 の文：自動の答えにも担当者にも回さず、アカウントを選ぶボタン。押すまでは変えない", async () => {
    two();
    const res = await handler.handleFreeText(LINE_USER, Q73);
    expect(askedAi).not.toHaveBeenCalled();
    expect(textOf(res)).toContain("自動投稿を「1日1回」に変えます。変えるアカウントを選んでください。");
    expect(dataList(res)).toEqual(["s=fqok&q=100&a=11&v=1", "s=fqok&q=100&a=12&v=1", "s=fqok&q=100&a=all&v=1", "s=fqno&q=100"]);
    expect(acctUpdates).toHaveLength(0);
    expect(autoSettings).toHaveLength(0);
    expect(questions[100]).toMatchObject({ category: SETTING_CATEGORY.frequency, needsHuman: 0 });
    expect(notices).toHaveLength(0);
  });

  it("アカウントを押すと、そのアカウントだけ1日1回（個別設定）・自動で対応済み・三上様へ知らせる・元に戻せる", async () => {
    two();
    await handler.handleFreeText(LINE_USER, Q73);
    const res = await handler.handlePostback(LINE_USER, "s=fqok&q=100&a=11&v=1");
    expect(acctUpdates).toEqual([{ id: 11, v: { autoPostFrequency: "daily" } }]);
    expect(autoSettings).toHaveLength(0);
    expect(textOf(res)).toContain("@qa_a の自動投稿を「1日1回」に変えました。");
    expect(dataList(res)).toContain("s=fqset&a=11&v=inherit");
    expect(questions[100].handledBy).toBe(SETTING_HANDLED_BY.frequency);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "frequency", outcome: "applied", questionId: 100, account: "@qa_a" });
    expect(notices[0].details[0]).toBe("@qa_a：1日3回 → 1日1回");
    expect(notices[0].reply).toBe(textOf(res));
    // 2回押しても二重に変えない
    const again = await handler.handlePostback(LINE_USER, "s=fqok&q=100&a=11&v=1");
    expect(textOf(again)).toContain("すでに変えています");
    expect(acctUpdates).toHaveLength(1);
    expect(notices).toHaveLength(1);
    // 元に戻す＝個別の回数を外す
    await handler.handlePostback(LINE_USER, "s=fqset&a=11&v=inherit");
    expect(acctUpdates[1]).toEqual({ id: 11, v: { autoPostFrequency: null } });
  });

  it("「すべてのアカウント」は共通の設定を変え、個別の回数は外してそろえる", async () => {
    two();
    accounts[1].autoPostFrequency = "twice_daily";
    await handler.handleFreeText(LINE_USER, "1日1回に変更してください");
    const res = await handler.handlePostback(LINE_USER, "s=fqok&q=100&a=all&v=1");
    expect(autoSettings).toEqual([{ uid: 1, v: { autoPostFrequency: "daily" } }]);
    expect(acctUpdates).toEqual([{ id: 12, v: { autoPostFrequency: null } }]);
    expect(textOf(res)).toContain("すべてのアカウントの自動投稿を「1日1回」に変えました。");
    // 個別の回数を外したときは、ボタン1つで戻せないので「元に戻す」を出さない
    expect(dataList(res).some((d) => d.startsWith("s=fqset"))).toBe(false);
  });

  it("アカウント1つ：［1日2回にする］で共通の設定を変える・［元に戻す］は前の回数", async () => {
    const res = await handler.handleFreeText(LINE_USER, "自動投稿を1日2回にしてください");
    expect(dataList(res)).toEqual(["s=fqok&q=100&a=all&v=2", "s=fqno&q=100"]);
    expect(labels(res)).toEqual(["1日2回にする", "今のままにする"]);
    const done = await handler.handlePostback(LINE_USER, "s=fqok&q=100&a=all&v=2");
    expect(autoSettings).toEqual([{ uid: 1, v: { autoPostFrequency: "twice_daily" } }]);
    expect(dataList(done)).toContain("s=fqset&a=all&v=3");
  });

  it("［今のままにする］なら変えない", async () => {
    await handler.handleFreeText(LINE_USER, "1日1回に変更してください");
    const res = await handler.handlePostback(LINE_USER, "s=fqno&q=100");
    expect(textOf(res)).toContain("今のままにします");
    expect(autoSettings).toHaveLength(0);
    expect(acctUpdates).toHaveLength(0);
    expect(questions[100].handledBy).toBe(SETTING_HANDLED_BY.declined);
  });

  it("すでにその回数なら、変えずにそうお伝えする", async () => {
    user.autoPostFrequency = "daily";
    const res = await handler.handleFreeText(LINE_USER, "1日1回に変更してください");
    expect(textOf(res)).toContain("すでに1日1回です");
    expect(questions[100].handledBy).toBe(SETTING_HANDLED_BY.frequencyInfo);
    expect(autoSettings).toHaveLength(0);
  });

  it("プランの上限より多い回数は変えずに、上限をお伝えする（ライト＝1日1回）", async () => {
    plan = "light";
    user.autoPostFrequency = "daily";
    const res = await handler.handleFreeText(LINE_USER, "1日3回にしてください");
    expect(textOf(res)).toContain("自動投稿は1日1回までです。回数は変えていません。");
    expect(autoSettings).toHaveLength(0);
    // ボタンのデータを書き換えて送っても変わらない
    const forced = await handler.handlePostback(LINE_USER, "s=fqset&a=all&v=3");
    expect(textOf(forced)).toContain("1日1回までです");
    expect(autoSettings).toHaveLength(0);
  });

  it("ほかのお客様のアカウントは変えられない", async () => {
    accounts.push({ id: 99, userId: 2, threadsUsername: "other", isActive: true, autoPostFrequency: null });
    const res = await handler.handlePostback(LINE_USER, "s=fqset&a=99&v=1");
    expect(textOf(res)).toContain("見つかりませんでした");
    expect(acctUpdates).toHaveLength(0);
  });

  it("設定の画面の［1日の回数を変える］：今の回数以外を選べる・押すと変わる", async () => {
    two();
    const acct = await handler.handlePostback(LINE_USER, "s=acct&a=11");
    expect(textOf(acct)).toContain("・1日の回数：1日3回（共通）");
    expect(dataList(acct)).toContain("s=freq&a=11");
    const menu = await handler.handlePostback(LINE_USER, "s=freq&a=11");
    expect(textOf(menu)).toContain("@qa_a の自動投稿は、いま1日3回です。");
    expect(dataList(menu)).toEqual(["s=fqset&a=11&v=1", "s=fqset&a=11&v=2", "m=settings"]);
    const done = await handler.handlePostback(LINE_USER, "s=fqset&a=11&v=1");
    expect(acctUpdates).toEqual([{ id: 11, v: { autoPostFrequency: "daily" } }]);
    expect(textOf(done)).toContain("@qa_a の自動投稿を「1日1回」に変えました。");
    // ご本人の操作なので、ご質問の記録も三上様への知らせも作らない
    expect(Object.keys(questions)).toHaveLength(0);
    expect(notices).toHaveLength(0);
  });
});

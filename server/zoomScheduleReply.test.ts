import { describe, it, expect, vi, beforeEach } from "vitest";
import { looksLikeScheduleReply, isZoomThread } from "../shared/zoomScheduling";

/**
 * 2026-09-28 川邊様：「Zoom希望」のあと、日程のお返事が自動応答に回っていた。
 * #47「平日12:30ごろが希望です」→ 投稿の時間と取り違え「投稿時刻は指定できません」と自信ありで返信。
 * #48「10/1の12:30にお願いします！」→ 同じく投稿の時間の説明。
 */
describe("Zoomの日程のお返事の見分け", () => {
  it.each([
    "平日12:30ごろが希望です",
    "10/1の12:30にお願いします！",
    "木曜の午後なら大丈夫です",
    "明日の15時からでお願いします",
  ])("日程のお返事：%s", (t) => expect(looksLikeScheduleReply(t)).toBe(true));

  it.each([
    "投稿の時間を12:30にしてほしい",
    "朝の投稿が出ていません",
    "プランの変更はできますか？",
    "ありがとうございます",
  ])("日程ではない：%s", (t) => expect(looksLikeScheduleReply(t)).toBe(false));

  it("Zoomのやりとりの見分け", () => {
    expect(isZoomThread({ question: "【Zoom希望】画面を一緒に見ながらの説明をご希望です。" })).toBe(true);
    expect(isZoomThread({ question: "料金について", staffReply: "Zoomでのご説明のご希望、ありがとうございます。" })).toBe(true);
    expect(isZoomThread({ question: "料金について", staffReply: "月額4,980円です" })).toBe(false);
  });
});

vi.mock("./lineNotify", () => ({ pushLine: vi.fn(), replyLine: vi.fn(), pushLineWithButtons: vi.fn() }));
vi.mock("./supportNotify", () => ({ notifyStaffOfQuestion: vi.fn(async () => true) }));
const answerQuestion = vi.fn(async () => ({ answer: "投稿時刻は指定できません", confident: true, category: "投稿の内容" }));
vi.mock("./supportBot", () => ({ answerQuestion }));

const state: { recent: any[] } = { recent: [] };
const createSupportQuestion = vi.fn(async () => 99);
vi.mock("./db", () => {
  const impl: Record<string, any> = {
    getUserByLineUserId: async () => ({ id: 12800, email: "qa@example.com", name: "QA" }),
    getUserById: async () => ({ id: 12800, email: "qa@example.com", name: "QA" }),
    getSubscriptionByUserId: async () => ({ planId: "pro", status: "active" }),
    getThreadsAccountsByUserId: async () => [],
    getUserProjects: async () => [],
    getLineChatState: async () => null,
    getRecentSupportQuestionsByUser: async () => state.recent,
    createSupportQuestion,
    findOwnRecentPostByContent: async () => null,
  };
  return new Proxy(impl, {
    get: (o, k: any) => (k in o ? o[k] : k === "then" || typeof k === "symbol" ? undefined : async () => undefined),
    has: (o, k: any) => k in o || (k !== "then" && typeof k === "string"),
  });
});

const handler: any = await import("./lineChatHandler");
const textOf = (res: any) => (Array.isArray(res) ? res : [res]).map((m: any) => String(m?.text ?? "")).join("\n");

describe("Zoomのあとの日程のお返事は担当者へ", () => {
  beforeEach(() => { createSupportQuestion.mockClear(); state.recent = []; });

  it("直近にZoomのやりとりがあれば、担当者へお渡しして日程の受付を返す", async () => {
    state.recent = [{ question: "【Zoom希望】画面を一緒に見ながらの説明をご希望です。", staffReply: null }];
    const res = await handler.handleFreeText("Uzoom", "平日12:30ごろが希望です");
    expect(textOf(res)).toContain("担当者にお伝えしました");
    expect(textOf(res)).not.toContain("投稿時刻");
    expect(createSupportQuestion).toHaveBeenCalledTimes(1);
    expect(String((createSupportQuestion.mock.calls[0] as any[])[0].question)).toContain("【Zoom日程】");
    expect((createSupportQuestion.mock.calls[0] as any[])[0].category).toBe("その他");
  });

  it("Zoomのやりとりが無ければ、今までどおり（担当者の日程受付にはしない）", async () => {
    const res = await handler.handleFreeText("Uzoom", "平日12:30ごろが希望です");
    expect(textOf(res)).not.toContain("担当者にお伝えしました");
    expect(answerQuestion).toHaveBeenCalled();
  });
});

/**
 * 2026-10-01 川邊様 #51：日程が決まり担当者がURLを送った後、当日に
 * 「お世話になっております。本日のzoomのURL教えていただきたいです。よろしくお願い致します」（40字超）
 * → 「Zoom希望」の受け取り口に入らず自動応答へ。「この画面からはお伝えできません。『Zoom希望』と送って」と返していた。
 */
describe("Zoomの約束の後の「URLを教えて」", () => {
  const ASK = "お世話になっております。\n本日のzoomのURL教えていただきたいです。\nよろしくお願い致します";
  const URL = "https://us06web.zoom.us/j/87107752102?pwd=abc.1";
  beforeEach(() => { createSupportQuestion.mockClear(); answerQuestion.mockClear(); state.recent = []; });

  it("送ったURLが記録にあれば、その場でお返しし、担当者にも渡す", async () => {
    state.recent = [
      { question: "10/1の12:30にお願いします！", staffReply: `日時：10月1日（木）12:30〜13:00\n${URL}\n\nパスコード：776163` },
      { question: "【Zoom希望】画面を一緒に見ながらの説明をご希望です。", staffReply: "Zoomでのご説明のご希望、ありがとうございます。" },
    ];
    const res = await handler.handleFreeText("Uzoom", ASK);
    expect(textOf(res)).toContain(URL);
    expect(textOf(res)).not.toContain("お伝えすることができません");
    expect(answerQuestion).not.toHaveBeenCalled();
    expect(String((createSupportQuestion.mock.calls[0] as any[])[0].question)).toContain("【Zoom日程】");
  });

  it("URLが記録に無ければ、担当者からお送りする旨を返す", async () => {
    state.recent = [{ question: "【Zoom希望】画面を一緒に見ながらの説明をご希望です。", staffReply: null }];
    const res = await handler.handleFreeText("Uzoom", ASK);
    expect(textOf(res)).toContain("担当者からこのトークにお送りします");
    expect(answerQuestion).not.toHaveBeenCalled();
  });

  it("Zoomのやりとりが無い方の長めの「Zoomで教えて」も、Zoom希望として受ける", async () => {
    const res = await handler.handleFreeText("Uzoom", "お世話になっております。使い方などをzoomで教えていただくことはできますでしょうか。よろしくお願いいたします。");
    expect(textOf(res)).toContain("Zoomで画面を一緒に見ながら進めます");
    expect(String((createSupportQuestion.mock.calls[0] as any[])[0].question)).toContain("【Zoom希望】");
  });

  it("もう一度のZoom希望には、古いURLを返さない", async () => {
    state.recent = [{ question: "10/1の12:30", staffReply: `${URL}` }];
    const res = await handler.handleFreeText("Uzoom", "またZoomお願いしたいです");
    expect(textOf(res)).not.toContain(URL);
  });
});

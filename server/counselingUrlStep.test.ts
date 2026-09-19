import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 「はじめの設定」の1問目（ホームページのURL）で止まる人がいる。
 *
 * 受け付けていたのは「なし」「無い」などの一語だけで、
 * お客様が書かれる「ホームページはありません」「持っていないです」は通らず、
 * まったく同じご案内がくり返されていた
 * （2026-09-20 夜間整備の通し確認で、21回くり返るのを実測）。
 * ここで止まると、その方は設定に一歩も入れず、投稿も始まらない。
 *
 * 文章で「無い」と言われた場合も受け、それでも通じないときは3回目で質問に進む。
 */
vi.mock("./lineNotify", () => ({ pushLine: vi.fn(), replyLine: vi.fn(), pushLineWithButtons: vi.fn() }));
vi.mock("./websitePrefill", () => ({
  extractUrl: (t: string) => (/(https?:\/\/\S+)/.exec(t)?.[1] ?? null),
  buildPrefillFromWebsite: async () => ({ ok: false, reason: "テスト" }),
}));

const LINE_USER = "Uqaurlstep";
let project: any;
let state: any = null;

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
  };
  for (const name of [
    "getThreadsAccountsByUserId", "getActiveThreadsAccounts", "getSubscriptionByUserId",
    "counselingBackupKey", "setCounselingBackup", "getCounselingBackup", "clearCounselingBackup",
    "createSupportQuestion", "logEvent", "getLineFollower", "findOwnRecentPostByContent",
    "updateProject", "getScheduledPostsByUser", "setLineFollowerOptOut",
  ]) impl[name] ??= async () => undefined;
  return impl;
});

const handler: any = await import("./lineChatHandler");

const textOf = (res: any) => (Array.isArray(res) ? res : [res])
  .map((m: any) => String(m?.text ?? m?.altText ?? "")).join("\n");

/** URL待ちの状態から始める */
const startAwaitingUrl = () => {
  state = {
    state: "counseling",
    payload: JSON.stringify({ mode: "store", step: 0, answers: {}, projectId: "line_qa1", quick: true, awaitingUrl: true }),
    ageMin: 0,
  };
};

describe("はじめの設定の1問目（ホームページのURL）で止めない", () => {
  beforeEach(() => {
    project = { id: "line_qa1", mode: "store", businessType: null, area: null, storeName: null };
    startAwaitingUrl();
  });

  it("「ホームページはありません」で質問に進む", async () => {
    const res = await handler.handleFreeText(LINE_USER, "ホームページはありません");
    expect(textOf(res)).toContain("質問でお聞きします");
    expect(textOf(res)).not.toContain("URLが見つかりませんでした");
  });

  it("「持っていないです」でも進む", async () => {
    const res = await handler.handleFreeText(LINE_USER, "持っていないです");
    expect(textOf(res)).toContain("質問でお聞きします");
  });

  it("「ないです。」のように句点が付いても進む", async () => {
    const res = await handler.handleFreeText(LINE_USER, "ないです。");
    expect(textOf(res)).toContain("質問でお聞きします");
  });

  it("通じない返事が続いても、3回目には質問に進む（同じ案内をくり返さない）", async () => {
    const a = await handler.handleFreeText(LINE_USER, "よろしくお願いします");
    expect(textOf(a)).toContain("URLが見つかりませんでした");
    const b = await handler.handleFreeText(LINE_USER, "よろしくお願いします");
    expect(textOf(b)).toContain("URLが見つかりませんでした");
    const c = await handler.handleFreeText(LINE_USER, "よろしくお願いします");
    expect(textOf(c)).toContain("とばします");
    expect(textOf(c)).not.toContain("URLが見つかりませんでした");
  });

  it("案内には「無い」と送る道も書いてある", async () => {
    const res = await handler.handleFreeText(LINE_USER, "よろしくお願いします");
    expect(textOf(res)).toContain("「無い」と送ってください");
  });

  it("URLを貼れば、これまでどおり読み取りに進む", async () => {
    const res = await handler.handleFreeText(LINE_USER, "https://example.com");
    expect(textOf(res)).toContain("読み取れませんでした");
  });
});

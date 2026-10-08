import { describe, it, expect, vi, beforeEach } from "vitest";

// 2026-10-08 プレステージ様：投稿カードの本文の1行目を直して、ボタンを押さずに公式LINEへ送り返した。
// 「投稿の材料」として預かられ、投稿は直す前の文のまま公開された。→ その投稿の修正として反映する。
vi.mock("./lineNotify", () => ({ pushLine: vi.fn(), replyLine: vi.fn(), pushLineWithButtons: vi.fn(), pushMessages: vi.fn() }));

const LINE_USER = "Upastededit";
let state: any = null;
let posts: any[] = [];
const updates: Array<{ id: number; data: any }> = [];
const original = "未経験で入社。3ヶ月の研修で、本当に指名もらえる？\n\nプレステージは未経験者が8割以上。\n\n先輩がしっかりサポートします。";
const edited = "未経験で入社。不安もたくさんありますよね。\n\nプレステージは未経験者が8割以上。\n\n先輩がしっかりサポートします。";

vi.mock("./db", async () => {
  const { bestPastedMatch } = await import("../shared/postMatch");
  const impl: Record<string, any> = {
    getUserByLineUserId: async () => ({ id: 1, email: "qa@example.com", name: "QA" }),
    getUserById: async () => ({ id: 1, email: "qa@example.com", name: "QA" }),
    getLineChatState: async () => state,
    getLineChatStateIgnoringTtl: async () => state,
    setLineChatState: async (_u: string, s: string, d: string) => { state = { state: s, payload: d, ageMin: 0 }; },
    clearLineChatState: async () => { state = null; },
    getSubscriptionByUserId: async () => ({ planId: "pro", status: "active" }),
    hasServiceAccess: async () => true,
    hasUsableSubscription: async () => true,
    isEndedCustomer: async () => false,
    isInDunning: async () => false,
    isFreeGrace: async () => false,
    getUserProjects: async () => [{ id: "p1", businessType: "エステ" }],
    getThreadsAccountsByUserId: async () => [{ id: 22, isActive: true }],
    getActiveThreadsAccounts: async () => [{ id: 22, isActive: true }],
    findOwnPostBySimilarity: async (_u: number, t: string) => {
      const open = posts.filter((p) => p.status === "awaiting_approval" || p.status === "pending");
      return bestPastedMatch(t, open) ?? bestPastedMatch(t, posts);
    },
    findOwnRecentPostByContent: async () => null,
    getScheduledPostById: async (id: number) => posts.find((p) => p.id === id) ?? null,
    updateScheduledPost: async (id: number, data: any) => { updates.push({ id, data }); Object.assign(posts.find((p) => p.id === id), data); },
  };
  return new Proxy(impl, { get: (t, k: any) => (k in t ? t[k] : (k === "then" || typeof k === "symbol" || k === "__esModule" || k === "default") ? undefined : async () => undefined), has: (t, k: any) => k in t || (typeof k === "string" && !["then", "__esModule", "default"].includes(k)) });
});

const handler: any = await import("./lineChatHandler");
const textOf = (res: any) => (Array.isArray(res) ? res : [res]).map((m: any) => String(m?.text ?? m?.altText ?? "")).join("\n");

describe("直して送り返された文は、その投稿の修正として反映する", () => {
  beforeEach(() => {
    state = null; updates.length = 0;
    posts = [
      { id: 2871, userId: 1, status: "awaiting_approval", postContent: original, originalContent: null, scheduledAt: new Date("2026-10-08T04:14:00Z") },
      { id: 2796, userId: 1, status: "posted", postContent: "エステの仕事は、実はチーム戦。\n\n川崎のプレステージは、みんなで支え合って働いています。", originalContent: null },
    ];
  });
  it("ボタンを押さずに送っても、公開前の投稿が差し替わる（直す前の文は残す）", async () => {
    const res = await handler.handleFreeText(LINE_USER, edited);
    expect(textOf(res)).toContain("投稿を直しました");
    expect(posts[0].postContent).toBe(edited);
    expect(posts[0].originalContent).toBe(original);
    expect(posts[0].editedByUserAt).toBeInstanceOf(Date);
    expect(state?.state).not.toBe("pending_material");
  });
  it("「直す前に戻す」で元の文に戻る", async () => {
    await handler.handleFreeText(LINE_USER, edited);
    const res = await handler.handlePostback(LINE_USER, "a=revertedit&i=2871");
    expect(textOf(res)).toContain("直す前の文に戻しました");
    expect(posts[0].postContent).toBe(original);
  });
  it("公開済みの投稿を直した文なら、差し替えられないことと、出し直し方を伝える", async () => {
    posts[0].status = "posted";
    const res = await handler.handleFreeText(LINE_USER, edited);
    expect(textOf(res)).toContain("すでにThreadsに公開された投稿");
    expect(updates.length).toBe(0);
  });
});

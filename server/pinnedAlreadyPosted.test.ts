import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 固定投稿がもう公開されているアカウントで「固定投稿を作る」を押したとき。
 * 2026-09-26 川邊様（acc34）：朝8:30に公開した固定投稿のピン留めが済まないうちに、
 * 昼にもう一度作って18:08に公開し、同じ趣旨の固定投稿が2件出た（その日は自動4件と合わせて6件）。
 */
vi.mock("./lineNotify", () => ({ pushLine: vi.fn(), replyLine: vi.fn(), pushLineWithButtons: vi.fn() }));

const state: { posted: boolean; confirmed: boolean; queuedAt: Date | null } = { posted: true, confirmed: false, queuedAt: null };
const createPinnedDraft = vi.fn(async () => ({ error: "作成は呼ばれた" }));
vi.mock("./pinnedPostFlow", () => ({ createPinnedDraft }));

vi.mock("./db", () => {
  const impl: Record<string, any> = {
    getUserByLineUserId: async () => ({ id: 1, email: "qa@example.com", name: "QA" }),
    getSubscriptionByUserId: async () => ({ planId: "pro", status: "active" }),
    getThreadsAccountsByUserId: async () => [{ id: 34, threadsUsername: "sinseikotu", isActive: true }],
    getUserProjects: async () => [{ id: "p1", links: JSON.stringify([{ id: "l1", type: "line", label: "LINE", url: "https://lin.ee/x" }]) }],
    getLineChatState: async () => null,
    getAccountPinnedProgress: async () => ({ created: true, posted: state.posted }),
    isPinnedPostConfirmedForAccount: async () => state.confirmed,
    getQueuedPinnedPostAt: async () => state.queuedAt,
  };
  for (const name of ["logEvent", "getLineFollower", "clearLineChatState", "setLineChatState", "getLineChatStateIgnoringTtl", "getUserById"])
    impl[name] ??= async () => undefined;
  return impl;
});

const handler: any = await import("./lineChatHandler");
const textOf = (res: any) => (Array.isArray(res) ? res : [res]).map((m: any) => String(m?.text ?? "")).join("\n");
const buttonsOf = (res: any): Array<{ label: string; data: string }> =>
  (Array.isArray(res) ? res : [res]).flatMap((m: any) => (m?.quickReply?.items ?? []).map((i: any) => ({ label: i.action?.label, data: i.action?.data })));

describe("固定投稿が公開済みのアカウントで「固定投稿を作る」", () => {
  beforeEach(() => { createPinnedDraft.mockClear(); state.posted = true; state.confirmed = false; state.queuedAt = null; });

  it("作らずに、公開済みであること・ピン留めだけでよいことを伝える", async () => {
    const res = await handler.handlePostback("Upin", "m=makepin&a=34");
    expect(createPinnedDraft).not.toHaveBeenCalled();
    expect(textOf(res)).toContain("もうThreadsに公開されています");
    const b = buttonsOf(res);
    expect(b.some((x) => x.data === "n=pinhow&a=34")).toBe(true);
    expect(b.some((x) => x.data === "m=makepin&a=34&again=1")).toBe(true);
  });

  it("「もう一度作る」を押せば作る", async () => {
    await handler.handlePostback("Upin", "m=makepin&a=34&again=1");
    expect(createPinnedDraft).toHaveBeenCalledTimes(1);
  });

  it("承認ずみで公開待ちの固定投稿があれば、予定の時刻を伝えて作らない（9/28 acc35 で2件公開）", async () => {
    state.posted = false;
    state.queuedAt = new Date("2026-09-28T08:36:00Z");
    const res = await handler.handlePostback("Upin", "m=makepin&a=34&again=1");
    expect(createPinnedDraft).not.toHaveBeenCalled();
    expect(textOf(res)).toContain("17:36 ごろに公開される予定");
  });

  it("まだ公開していなければ今までどおり作る", async () => {
    state.posted = false;
    await handler.handlePostback("Upin", "m=makepin&a=34");
    expect(createPinnedDraft).toHaveBeenCalledTimes(1);
  });
});

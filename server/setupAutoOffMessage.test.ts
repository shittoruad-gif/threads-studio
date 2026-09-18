import { describe, it, expect, vi } from "vitest";

/**
 * はじめの設定の最後で「自動投稿は始めずにおく」を選んだときの案内。
 *
 * ★2026-09-18 お客様目線の通し確認で発見。
 *   「その場でお試しの投稿を作ることもできます」と書きながら、そのボタンが無かった
 *   （ボタンは「やっぱり始める」とメニューだけ）。押せるものが無い案内は、お客様を迷わせる。
 *   自動投稿OFFのままでも作れるのは固定投稿だけなので、本当にできることを書き、そのボタンを付ける。
 */
vi.mock("./lineNotify", () => ({ pushLine: vi.fn(), replyLine: vi.fn(), pushLineWithButtons: vi.fn() }));

vi.mock("./db", () => {
  const impl: Record<string, any> = {
    getUserByLineUserId: async () => ({ id: 1, email: "qa@example.com", name: "QA" }),
    getSubscriptionByUserId: async () => ({ planId: "pro", status: "active" }),
    getThreadsAccountsByUserId: async () => [],
    getActiveThreadsAccounts: async () => [],
    getUserProjects: async () => [],
    getLineChatState: async () => null,
    getAutoPostSettings: async () => ({ autoPostEnabled: false, autoPostFrequency: "daily", autoPostRequireApproval: true }),
  };
  for (const name of [
    "updateAutoPostSettings", "getUserById", "logEvent", "getLineFollower", "createSupportQuestion",
    "clearLineChatState", "setLineChatState", "getLineChatStateIgnoringTtl",
  ]) impl[name] ??= async () => undefined;
  return impl;
});

const handler: any = await import("./lineChatHandler");

const textOf = (res: any) => (Array.isArray(res) ? res : [res]).map((m: any) => String(m?.text ?? "")).join("\n");
const buttonsOf = (res: any): Array<{ label: string; data: string }> =>
  (Array.isArray(res) ? res : [res]).flatMap((m: any) => (m?.quickReply?.items ?? []).map((i: any) => ({ label: i.action?.label, data: i.action?.data })));

describe("「自動投稿は始めずにおく」を選んだときの案内（2026-09-18）", () => {
  it("押せない約束（お試しの投稿）を書かず、本当にできる固定投稿のボタンを付ける", async () => {
    const res = await handler.handlePostback("Usetupoff", "c=setupauto&v=off");
    const text = textOf(res);
    const buttons = buttonsOf(res);

    expect(text).toContain("自動投稿は始めずにおきます");
    expect(text).not.toContain("お試しの投稿");
    expect(text).toContain("固定投稿");
    // 文で触れたものは、必ずその場で押せる
    expect(buttons.some((b) => b.data === "m=makepin")).toBe(true);
    expect(buttons.some((b) => b.data === "c=setupauto&v=on")).toBe(true);
    // 同じボタンが2つ並ばない（メニューにも固定投稿があるため）
    expect(buttons.filter((b) => b.data === "m=makepin")).toHaveLength(1);
  });
});

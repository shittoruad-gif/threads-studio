import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 「はじめの設定」のやり直しが、別のアカウントのお店の情報を黙って上書きしていた（R9）。
 *
 * 2026-09-16 梅原様（複数アカウント運用）：
 * 9/15 に @yusuke_seitai の設定を途中まで進め、9/16 8:18 に「最初からやり直す」を押したところ、
 * だいご接骨院の情報（J3TlebIVAOl6-1IoSKm1_）が丸ごとダイエットの内容に置き換わり、
 * @yusuke_seitai への紐づけも空のままだった。
 *
 * 原因は「どのアカウントの設定か」を引き継いでいない道が2つあったこと。
 *  - 途中のままの設定に出す「最初からやり直す」ボタン（`c=start&mode=…&fresh=1`）に a= が無い
 *  - 1問目で「戻る」と送られたときの `startCounseling(lineUserId)` に accountId を渡していない
 * accountId が落ちると `c=start` 側は「既存の1件目のプロジェクト」を書き換え先に選ぶ。
 */
vi.mock("./lineNotify", () => ({ pushLine: vi.fn(), replyLine: vi.fn(), pushLineWithButtons: vi.fn() }));

const LINE_USER = "Uacctscopetest";
let state: any = null;
let projects: any[] = [];
let accounts: any[] = [];

vi.mock("./db", () => {
  const impl: Record<string, any> = {
    getUserByLineUserId: async () => ({ id: 1, email: "qa@example.com", name: "QA" }),
    getUserProjects: async () => projects,
    getProjectsByUserId: async () => projects,
    getProjectById: async (id: string) => projects.find((p) => p.id === id),
    getLineChatState: async () => state,
    getLineChatStateIgnoringTtl: async () => state,
    setLineChatState: async (_u: string, s: string, d: string) => { state = { state: s, payload: d, ageMin: 0 } as any; },
    clearLineChatState: async () => { state = null; },
    getThreadsAccountsByUserId: async () => accounts,
    getActiveThreadsAccounts: async () => accounts.filter((a) => a.isActive),
    getThreadsAccountById: async (id: number) => accounts.find((a) => a.id === Number(id)),
    getSubscriptionByUserId: async () => ({ planId: "pro", status: "active" }),
  };
  for (const name of [
    "counselingBackupKey", "setCounselingBackup", "getCounselingBackup", "clearCounselingBackup",
    "setLineFollowerOptOut", "getScheduledPostsByUser", "createSupportQuestion", "getUserById",
    "updateProject", "updateThreadsAccount", "getLineFollower", "logEvent", "findOwnRecentPostByContent",
  ]) impl[name] ??= async () => undefined;
  return impl;
});

const handler: any = await import("./lineChatHandler");

const textOf = (res: any) => (Array.isArray(res) ? res : [res])
  .map((m: any) => String(m?.text ?? m?.altText ?? "")).join("\n");
const quickData = (res: any) => (Array.isArray(res) ? res : [res])
  .flatMap((m: any) => (m?.quickReply?.items ?? []).map((i: any) => String(i?.action?.data ?? "")));

const DAIGO = { id: "J3Tleb", storeName: "だいご接骨院", businessType: "整体院", area: "岡山", target: "会社員", mainProblem: "腰痛", strength: "国家資格" };

describe("はじめの設定は、どのアカウントの分かを最後まで持ち回る（R9）", () => {
  beforeEach(() => {
    state = null;
    projects = [{ ...DAIGO }];
    accounts = [
      { id: 18, userId: 1, isActive: true, threadsUsername: "daigo.sekkotsuin", defaultProjectId: "J3Tleb" },
      { id: 29, userId: 1, isActive: true, threadsUsername: "yusuke_seitai", defaultProjectId: null },
    ];
  });

  it("途中のままの設定に出す「最初からやり直す」が、アカウントを引き継ぐ", async () => {
    state = {
      state: "counseling", ageMin: 0,
      payload: JSON.stringify({ mode: "store", step: 2, answers: {}, projectId: undefined, accountId: 29, quick: true }),
    };
    const res = await handler.handlePostback(LINE_USER, "c=start&mode=store");
    expect(textOf(res)).toContain("途中のままになっています");
    const redo = quickData(res).find((d) => d.includes("fresh=1"));
    expect(redo).toBeTruthy();
    expect(redo).toContain("a=29"); // ← ここが抜けていたのが梅原様の件の正体
  });

  it("アカウントの分からない「やり直し」では、既存のお店の情報を書き換え先にしない", async () => {
    // accountId を引き継ぎ損ねた古いボタンから来た場合の受け皿。
    const res = await handler.handlePostback(LINE_USER, "c=start&mode=store&fresh=1");
    expect(textOf(res)).toContain("どのアカウントの情報を登録しますか");
    expect(quickData(res)).toEqual(expect.arrayContaining(["c=acct&a=18", "c=acct&a=29"]));
    // 設定は始まっていない＝だいご接骨院の情報は書き換え先になっていない
    expect(state?.state).not.toBe("counseling");
  });

  it("紐づけ先の無いアカウントを指定したら、新しいお店の情報を作る（1件目を上書きしない）", async () => {
    const res = await handler.handlePostback(LINE_USER, "c=start&mode=store&fresh=1&a=29");
    expect(textOf(res)).toContain("【1／5】");
    const st = JSON.parse(state.payload);
    expect(st.accountId).toBe(29);
    expect(st.projectId).not.toBe("J3Tleb");
    expect(String(st.projectId)).toMatch(/^line_/);
  });

  it("紐づけ先のあるアカウントは、そのアカウントのお店の情報をやり直す", async () => {
    const res = await handler.handlePostback(LINE_USER, "c=start&mode=store&fresh=1&a=18");
    expect(textOf(res)).toBeTruthy();
    const st = JSON.parse(state.payload);
    expect(st.accountId).toBe(18);
    expect(st.projectId).toBe("J3Tleb");
  });

  it("アカウントが1件だけの方は、これまでどおり既存のお店の情報をやり直す", async () => {
    accounts = [{ id: 18, userId: 1, isActive: true, threadsUsername: "daigo.sekkotsuin", defaultProjectId: null }];
    const res = await handler.handlePostback(LINE_USER, "c=start&mode=store&fresh=1");
    expect(textOf(res)).not.toContain("どのアカウントの情報を登録しますか");
    const st = JSON.parse(state.payload);
    expect(st.projectId).toBe("J3Tleb");
  });
});

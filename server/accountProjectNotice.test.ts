import { describe, it, expect, vi, beforeEach } from "vitest";

const pushed: unknown[][] = [];
const updated: Array<{ id: number; patch: any }> = [];

vi.mock("./db", () => ({
  getLineUserIdsForUser: async () => ["U1"],
  updateThreadsAccount: async (id: number, patch: any) => { updated.push({ id, patch }); },
}));
vi.mock("./lineNotify", () => ({
  pushMessages: async (_to: string, msgs: unknown[]) => { pushed.push(msgs); return true; },
}));

import { notifyProjectMissing } from "./accountProjectNotice";

describe("お店の情報が未設定のご案内", () => {
  beforeEach(() => { pushed.length = 0; updated.length = 0; });

  it("まだ案内していなければ送り、送った日時を残す", async () => {
    const sent = await notifyProjectMissing({ id: 1 }, { id: 33, threadsUsername: "esthetic.salon_prestige" });
    expect(sent).toBe(true);
    expect(JSON.stringify(pushed)).toContain("@esthetic.salon_prestige");
    // 設定へ進むボタンが、そのアカウントを指していること
    expect(JSON.stringify(pushed)).toContain("c=acct&a=33");
    expect(updated[0]?.id).toBe(33);
    expect(updated[0]?.patch?.projectMissingNoticeAt).toBeInstanceOf(Date);
  });

  it("24時間以内に案内ずみなら、もう送らない（毎朝くり返さない）", async () => {
    const sent = await notifyProjectMissing(
      { id: 1 },
      { id: 33, threadsUsername: "a", projectMissingNoticeAt: new Date(Date.now() - 60 * 60 * 1000) },
    );
    expect(sent).toBe(false);
    expect(pushed).toEqual([]);
  });

  it("24時間たっていれば、もう一度案内する", async () => {
    const sent = await notifyProjectMissing(
      { id: 1 },
      { id: 33, threadsUsername: "a", projectMissingNoticeAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    );
    expect(sent).toBe(true);
  });
});

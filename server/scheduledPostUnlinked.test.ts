import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 連携を解除されたThreadsアカウント（isActive=0）の予約投稿を、公開しに行かないこと。
 *
 * ★2026-09-18 夜間整備で本番のログから見つけた。
 *   連携解除（db.deleteThreadsAccount）は isActive=0 にしてアクセストークンを空にするだけで、
 *   threadsAccounts の行は残る。executePendingPosts は getThreadsAccountById で取るが
 *   この関数は isActive を見ないため、「アカウントが見つからない」の分岐をすり抜け、
 *   空のトークンのまま Threads へ公開しに行っていた。
 *   結果、お客様には意味の分からない
 *   「Failed to create media container: Invalid OAuth 2.0 Access Token」が残る
 *   （森様・投稿 #1573。別のアカウントにつなぎ替えようと解除された直後だった）。
 */

const publish = vi.fn();

vi.mock("./threadsPost", () => ({
  createAndPublishThread: (...a: unknown[]) => publish(...a),
  splitThreadSegments: (t: string) => [t],
  PartialThreadError: class extends Error {},
}));
vi.mock("./threadsAuth", () => ({ refreshAccessToken: vi.fn(async () => null) }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(), sendEmail: vi.fn(async () => true) }));

const updates: Array<{ id: number; patch: any }> = [];
const account = {
  id: 23,
  userId: 4851,
  threadsUsername: "angyomori",
  isActive: false,          // ★連携解除ずみ
  accessToken: "",          // 解除時に空にされている
  tokenExpiresAt: new Date(Date.now() + 30 * 86400000),
};

vi.mock("./db", () => ({
  promoteSoftApprovedPosts: vi.fn(async () => ({ promoted: 0, expired: 0 })),
  getPendingScheduledPosts: vi.fn(async () => [
    { id: 1573, userId: 4851, threadsAccountId: 23, projectId: "p1", postContent: "本文です", scheduledAt: new Date() },
  ]),
  claimScheduledPost: vi.fn(async () => true),
  getThreadsAccountById: vi.fn(async () => account),
  updateScheduledPost: vi.fn(async (id: number, patch: any) => { updates.push({ id, patch }); }),
  updateThreadsAccountToken: vi.fn(),
  getUserById: vi.fn(async () => ({ id: 4851, email: "x@example.test" })),
}));

describe("連携解除ずみのアカウントの予約投稿（2026-09-18）", () => {
  beforeEach(() => { updates.length = 0; publish.mockReset(); });

  it("Threadsへ公開しに行かない", async () => {
    const { executePendingPosts } = await import("./scheduledPostExecutor");
    await executePendingPosts();
    expect(publish).not.toHaveBeenCalled();
  });

  it("「失敗」ではなく「見送り」として、理由が日本語で残る", async () => {
    const { executePendingPosts } = await import("./scheduledPostExecutor");
    await executePendingPosts();
    const u = updates.find((x) => x.id === 1573);
    expect(u).toBeTruthy();
    expect(u!.patch.status).toBe("canceled");
    expect(u!.patch.errorMessage).toContain("連携が解除されている");
    // お客様に意味の分からない英語のエラーを残さない
    expect(JSON.stringify(u!.patch)).not.toContain("Invalid OAuth");
  });

  // 連携が生きているアカウントを、この見送りで巻き込まないこと。
  // （公開そのものは日次上限の判定など多くの部品を通るので、ここでは
  //   「連携解除として見送られていない」ことだけを見る）
  it("連携が生きているアカウントは、この見送りに巻き込まれない", async () => {
    account.isActive = true;
    account.accessToken = "token-abc";
    try {
      const { executePendingPosts } = await import("./scheduledPostExecutor");
      await executePendingPosts();
      const cancels = updates.filter((u) => String(u.patch?.errorMessage ?? "").includes("連携が解除されている"));
      expect(cancels).toHaveLength(0);
    } finally {
      account.isActive = false;
      account.accessToken = "";
    }
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 契約が終わった方の自動の投稿は公開しない（2026-10-03 氷見様：解約の期限を過ぎてから2本公開されていた）。
 * 以下は scheduledPostUnlinked.test.ts と同じ組み立て。
 *
 * （元の説明）連携を解除されたThreadsアカウント（isActive=0）の予約投稿を、公開しに行かないこと。
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

let usable = false;
let dunning = false;
let source = "auto";
const updates: Array<{ id: number; patch: any }> = [];
const account = {
  id: 23,
  userId: 4851,
  threadsUsername: "angyomori",
  isActive: true,
  accessToken: "tok",
  tokenExpiresAt: new Date(Date.now() + 30 * 86400000),
};

vi.mock("./db", () => ({
  promoteSoftApprovedPosts: vi.fn(async () => ({ promoted: 0, expired: 0 })),
  getPendingScheduledPosts: vi.fn(async () => [
    { id: 2417, userId: 2907, threadsAccountId: 23, projectId: "p1", postContent: "本文です", scheduledAt: new Date(), source },
  ]),
  claimScheduledPost: vi.fn(async () => true),
  getThreadsAccountById: vi.fn(async () => account),
  updateScheduledPost: vi.fn(async (id: number, patch: any) => { updates.push({ id, patch }); }),
  updateThreadsAccountToken: vi.fn(),
  getUserById: vi.fn(async () => ({ id: 4851, email: "x@example.test" })),
  hasUsableSubscription: vi.fn(async () => usable),
  hasServiceAccess: vi.fn(async () => usable),
  isInDunning: vi.fn(async () => dunning),
  isEndedCustomer: vi.fn(async () => true),
}));

describe("契約が終わった方の自動の投稿（2026-10-03）", () => {
  beforeEach(() => { updates.length = 0; dunning = false; publish.mockReset(); publish.mockResolvedValue({ id: "x", permalink: "" }); });

  it("お支払い確認中（決済失敗）の方の予約は取り消さない（2026-10-04 点検）", async () => {
    usable = false; dunning = true; source = "auto";
    const { executePendingPosts } = await import("./scheduledPostExecutor");
    await executePendingPosts();
    expect(updates.find((x) => x.patch.status === "canceled")).toBeUndefined();
  });

  it("自動の投稿は公開せず、理由つきで見送りにする", async () => {
    usable = false; source = "auto";
    const { executePendingPosts } = await import("./scheduledPostExecutor");
    await executePendingPosts();
    expect(publish).not.toHaveBeenCalled();
    const u = updates.find((x) => x.id === 2417);
    expect(u?.patch.status).toBe("canceled");
    expect(u?.patch.errorMessage).toMatch(/ご契約が終了/);
  });

  it("使える契約が無ければ、ご自身で予約した投稿も公開しない（2026-10-03 フリープラン廃止）", async () => {
    usable = false; source = "manual";
    const { executePendingPosts } = await import("./scheduledPostExecutor");
    await executePendingPosts();
    expect(publish).not.toHaveBeenCalled();
    expect(updates.find((x) => x.id === 2417)?.patch.status).toBe("canceled");
  });

  it("契約が生きていれば止めない", async () => {
    usable = true; source = "auto";
    const { executePendingPosts } = await import("./scheduledPostExecutor");
    await executePendingPosts();
    expect(updates.find((x) => x.patch.status === "canceled")).toBeUndefined();
  });
});


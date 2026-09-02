import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 固定投稿の公開直後に、公式LINEのURLをコメント欄（1件目の返信）へ
 * 自動添付する処理の確認。実際のThreads APIは呼ばずに、渡る内容だけを見る。
 */
const calls: any[] = [];
vi.mock("./threadsPost", () => ({
  createAndPublishPost: vi.fn(async (opts: any) => { calls.push(opts); return { id: "reply_123" }; }),
}));

const { attachLineUrlComment } = await import("./pinnedPostFlow");

const LINKS = JSON.stringify([
  { id: "l1", type: "reservation", label: "Web予約", url: "https://example.com/reserve" },
  { id: "l2", type: "line", label: "公式LINE", url: "https://lin.ee/abc123" },
]);

beforeEach(() => { calls.length = 0; });

describe("固定投稿へのLINE URLコメント添付", () => {
  it("公式LINEが登録されていれば、そのURLを親投稿への返信として投稿する", async () => {
    const replyId = await attachLineUrlComment({
      accessToken: "tok",
      threadsUserId: "tuid",
      rootThreadsPostId: "root_1",
      project: { links: LINKS },
    });
    expect(replyId).toBe("reply_123");
    expect(calls).toHaveLength(1);
    expect(calls[0].replyToId).toBe("root_1");
    expect(calls[0].text).toContain("https://lin.ee/abc123");
    expect(calls[0].text).toContain("LINE");
  });

  it("公式LINEが未登録なら何もしない（Web予約だけでは出さない）", async () => {
    const onlyReserve = JSON.stringify([
      { id: "l1", type: "reservation", label: "Web予約", url: "https://example.com/reserve" },
    ]);
    const replyId = await attachLineUrlComment({
      accessToken: "tok", threadsUserId: "tuid", rootThreadsPostId: "root_1",
      project: { links: onlyReserve },
    });
    expect(replyId).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("linksが空・壊れていても落ちない", async () => {
    for (const links of [null, "", "{壊れたJSON", "[]"]) {
      const replyId = await attachLineUrlComment({
        accessToken: "tok", threadsUserId: "tuid", rootThreadsPostId: "root_1",
        project: { links },
      });
      expect(replyId).toBeNull();
    }
    expect(calls).toHaveLength(0);
  });
});

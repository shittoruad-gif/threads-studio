import { describe, it, expect, vi, beforeEach } from "vitest";
import { pickPinnedDestination, setPrimaryLink, getPrimaryLink } from "../shared/projectLinks";
import { buildCtaText } from "../shared/autoPostCta";

/**
 * 固定投稿の公開直後に、案内先のURLをコメント欄（1件目の返信）へ
 * 自動添付する処理の確認。実際のThreads APIは呼ばずに、渡る内容だけを見る。
 *
 * ★2026-09-04: 以前は公式LINEだけを見ていたため、公式LINEが無いお店では
 *   コメントが付かず、本文の締めも必ず「公式LINEから」になっていた。
 *   登録されているリンクの種類に合わせて出し分ける。
 */
const calls: any[] = [];
vi.mock("./threadsPost", () => ({
  createAndPublishPost: vi.fn(async (opts: any) => { calls.push(opts); return { id: "reply_123" }; }),
}));

const { attachLineUrlComment } = await import("./pinnedPostFlow");
const { pickPinnedDestination, parseProjectLinks } = await import("../shared/projectLinks");

const attach = (links: unknown) => attachLineUrlComment({
  accessToken: "tok", threadsUserId: "tuid", rootThreadsPostId: "root_1",
  project: { links: links as any },
});

beforeEach(() => { calls.length = 0; });

describe("固定投稿へのURLコメント添付", () => {
  it("公式LINEがあれば、LINEのURLとLINE向けの一言を返信する", async () => {
    const links = JSON.stringify([
      { id: "l1", type: "website", label: "公式HP", url: "https://example.com" },
      { id: "l2", type: "line", label: "公式LINE", url: "https://lin.ee/abc123" },
    ]);
    expect(await attach(links)).toBe("reply_123");
    expect(calls).toHaveLength(1);
    expect(calls[0].replyToId).toBe("root_1");
    expect(calls[0].text).toContain("https://lin.ee/abc123");
    expect(calls[0].text).toContain("ご登録・ご相談");
  });

  it("公式LINEが無くても、Web予約があれば予約向けの一言で返信する", async () => {
    const links = JSON.stringify([
      { id: "l1", type: "reservation", label: "Web予約", url: "https://example.com/reserve" },
    ]);
    expect(await attach(links)).toBe("reply_123");
    expect(calls[0].text).toContain("https://example.com/reserve");
    expect(calls[0].text).toContain("ご予約");
    expect(calls[0].text).not.toContain("LINE");
  });

  it("ホームページだけでも、HP向けの一言で返信する", async () => {
    const links = JSON.stringify([
      { id: "l1", type: "website", label: "公式HP", url: "https://example.com" },
    ]);
    expect(await attach(links)).toBe("reply_123");
    expect(calls[0].text).toContain("https://example.com");
    expect(calls[0].text).not.toContain("LINE");
    expect(calls[0].text).not.toContain("ご予約");
  });

  it("「その他」はお客様が付けたラベルをそのまま使う", async () => {
    const links = JSON.stringify([
      { id: "l1", type: "other", label: "無料相談フォーム", url: "https://example.com/form" },
    ]);
    expect(await attach(links)).toBe("reply_123");
    expect(calls[0].text).toContain("無料相談フォーム");
  });

  it("予約と公式LINEが両方あれば、申し込みに近い予約を優先する", () => {
    const links = parseProjectLinks(JSON.stringify([
      { id: "l1", type: "line", label: "公式LINE", url: "https://lin.ee/abc" },
      { id: "l2", type: "reservation", label: "Web予約", url: "https://example.com/reserve" },
    ]));
    expect(pickPinnedDestination(links)?.link.type).toBe("reservation");
  });

  it("同じ種類が複数あれば「既定」を優先する", () => {
    const links = parseProjectLinks(JSON.stringify([
      { id: "l1", type: "line", label: "旧LINE", url: "https://lin.ee/old" },
      { id: "l2", type: "line", label: "公式LINE", url: "https://lin.ee/new", isDefault: true },
    ]));
    expect(pickPinnedDestination(links)?.link.url).toBe("https://lin.ee/new");
  });

  it("リンクが1つも無ければ何もしない", async () => {
    for (const links of [null, "", "{壊れたJSON", "[]"]) {
      expect(await attach(links)).toBeNull();
    }
    expect(calls).toHaveLength(0);
  });
});

// ── お客様が選んだご案内先を最優先する（2026-09-04 三上様指示）──
describe("ご案内先の明示選択", () => {
  const links = [
    { id: "a", type: "reservation" as const, label: "Web予約", url: "https://ex.com/r" },
    { id: "b", type: "line" as const, label: "LINE公式", url: "https://lin.ee/x" },
  ];

  it("選ばれていなければ、申し込みに近い順で自動的に決まる", () => {
    expect(pickPinnedDestination(links)!.link.id).toBe("a");
  });

  it("選ばれていれば、優先順を無視してそちらを使う", () => {
    const chosen = setPrimaryLink(links, "b");
    const dest = pickPinnedDestination(chosen)!;
    expect(dest.link.id).toBe("b");
    expect(dest.channelName).toBe("公式LINE");
  });

  it("選び直すと1つだけになる", () => {
    const once = setPrimaryLink(links, "b");
    const twice = setPrimaryLink(once, "a");
    expect(twice.filter((l) => l.isPrimary).map((l) => l.id)).toEqual(["a"]);
  });

  it("null を渡すと自動判定に戻る", () => {
    const cleared = setPrimaryLink(setPrimaryLink(links, "b"), null);
    expect(getPrimaryLink(cleared)).toBeUndefined();
    expect(pickPinnedDestination(cleared)!.link.id).toBe("a");
  });

  it("毎日の投稿のCTAも、選ばれた先に合わせる", () => {
    const auto = buildCtaText({ links: JSON.stringify(links), businessType: "整体院" });
    expect(auto).toContain("ご予約");
    const chosen = buildCtaText({ links: JSON.stringify(setPrimaryLink(links, "b")), businessType: "整体院" });
    expect(chosen).toContain("公式LINE");
  });
});

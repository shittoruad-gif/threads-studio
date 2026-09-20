import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 承認待ちの投稿を翌朝へずらしていたために、公開が0件になる日ができていた（2026-09-21・実測）。
 *
 * 香取様（acc21・light_campaign・公開前確認あり）の実データ：
 *   9/18 21:09 に作られた投稿が承認されないまま、19時以降のスライドで「明日の10時台」へ送られる
 *   → 9/20 朝6時の生成が「今日すでに1件ある」と数えて新規を作らない
 *   → その1件も 12:02 に「承認されないまま日をまたいだため見送り」で消える
 *   → その日の公開は0件。9/15・9/16・9/17・9/19・9/20 は投稿が1本も作られていなかった。
 *
 * 日をまたいだ承認待ちは promoteSoftApprovedDuePosts が必ず見送りにする（R2・2026-09-12）ので、
 * 翌朝へずらすこと自体に意味がない。ずらさずに置けば日付が変わった時点で見送りになり、
 * 朝6時には新しい投稿が作られる。遅れて承認されたときは lateApprovalTime が別途拾う。
 */

const JST = 9 * 3600 * 1000;
/** JST の時刻を「今」にする */
const atJst = (s: string) => vi.setSystemTime(new Date(Date.parse(s + "+09:00")));

const updateScheduledPostTime = vi.fn(async () => undefined);
let overdue: any[] = [];

vi.mock("./db", () => ({
  getOverdueAwaitingApprovalPosts: vi.fn(async () => overdue),
  updateScheduledPostTime: (...a: any[]) => (updateScheduledPostTime as any)(...a),
}));
vi.mock("./lineChat", () => ({ textWithQuick: vi.fn() }));

const { runAwaitingSlideJob } = await import("./awaitingSlideJob");

describe("承認待ちのずらし（2026-09-21）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    updateScheduledPostTime.mockClear();
    overdue = [{ id: 1649, userId: 3500 }];
  });
  afterEach(() => vi.useRealTimers());

  it("昼間はその日の後ろの時間帯へずらす（現場に出ている方が夕方に承認できる）", async () => {
    atJst("2026-09-20T10:30:00");
    await runAwaitingSlideJob();
    expect(updateScheduledPostTime).toHaveBeenCalledTimes(1);
    const at: Date = updateScheduledPostTime.mock.calls[0][1];
    // 同じ日（JST）のままであること
    expect(new Date(at.getTime() + JST).toISOString().slice(0, 10)).toBe("2026-09-20");
  });

  it("19時以降は翌朝へ送らない（送ると翌日の枠を埋めたうえで見送りになる）", async () => {
    atJst("2026-09-20T19:10:00");
    await runAwaitingSlideJob();
    expect(updateScheduledPostTime).not.toHaveBeenCalled();
  });

  it("21時台も翌朝へ送らない", async () => {
    atJst("2026-09-20T21:20:00");
    await runAwaitingSlideJob();
    expect(updateScheduledPostTime).not.toHaveBeenCalled();
  });
});

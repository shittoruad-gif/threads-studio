/**
 * フォロワー数の取り口（threads_insights）のテスト。
 *
 * 2026-09-21：ユーザーノードの `?fields=followers_count` は実在しないフィールドで、
 * 常に code 100 のエラーが返っていた。その結果 followerSnapshots が1件も貯まらず、
 * 「導入前から動かしていた店」と「導入後から始めた店」の違いをフォロワーで説明できなかった。
 * 同じ取りこぼしを二度やらないための番人。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { getThreadsUserCounts } from "./threadsApi";

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status, json: async () => body })) as any
  );
}

describe("getThreadsUserCounts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("threads_insights を叩く（ユーザーノードの fields ではない）", async () => {
    const f = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ name: "followers_count", total_value: { value: 128 } }] }),
    }));
    vi.stubGlobal("fetch", f as any);

    await getThreadsUserCounts("tok", "17841463088609290");

    const url = String(f.mock.calls[0][0]);
    expect(url).toContain("/threads_insights?metric=followers_count");
    expect(url).not.toContain("fields=followers_count");
  });

  it("total_value からフォロワー数を読む", async () => {
    mockFetchOnce({ data: [{ name: "followers_count", total_value: { value: 128 } }] });
    expect(await getThreadsUserCounts("tok", "1")).toEqual({ followersCount: 128, followingCount: 0, ok: true });
  });

  it("values 形式（時系列）なら最後の値を読む", async () => {
    mockFetchOnce({
      data: [{ name: "followers_count", values: [{ value: 100 }, { value: 133 }] }],
    });
    expect((await getThreadsUserCounts("tok", "1")).followersCount).toBe(133);
  });

  it("APIエラー（存在しないフィールド等）は0を返して落とさない", async () => {
    mockFetchOnce({
      error: { message: "Tried accessing nonexisting field (followers_count)", code: 100 },
    });
    expect(await getThreadsUserCounts("tok", "1")).toEqual({ followersCount: 0, followingCount: 0, ok: false });
  });

  it("HTTPエラーでも落とさない", async () => {
    mockFetchOnce({}, false, 400);
    expect(await getThreadsUserCounts("tok", "1")).toEqual({ followersCount: 0, followingCount: 0, ok: false });
  });

  it("本当に0人のアカウントは ok:true の0として返す（開設直後は実在する）", async () => {
    mockFetchOnce({ data: [{ name: "followers_count", total_value: { value: 0 } }] });
    expect(await getThreadsUserCounts("tok", "1")).toEqual({ followersCount: 0, followingCount: 0, ok: true });
  });

  it("通信が落ちても例外を投げない", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }) as any);
    expect(await getThreadsUserCounts("tok", "1")).toEqual({ followersCount: 0, followingCount: 0, ok: false });
  });
});

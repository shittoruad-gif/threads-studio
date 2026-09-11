import { describe, it, expect, vi, afterEach } from "vitest";
import { collectOwnPostSamples } from "./styleSamplesFromThreads";

const CONNECT = "2026-09-10T00:00:00.000Z";

/** 40字以上の本文を作る（MIN_LEN の下限にかからないようにするため） */
const body = (label: string) => `${label}。${"あ".repeat(45)}`;

type FakePost = { id: string; text: string; timestamp: string; views: number };

/**
 * Threads API のふりをする fetch。
 *  - /threads → 新しい順の一覧
 *  - /<id>/insights → その投稿の表示数
 */
function stubThreads(posts: FakePost[]) {
  vi.stubGlobal("fetch", async (url: string) => {
    const u = String(url);
    if (u.includes("/insights")) {
      const id = u.split("/v1.0/")[1].split("/")[0];
      const views = posts.find((p) => p.id === id)?.views ?? 0;
      return { json: async () => ({ data: [{ values: [{ value: views }] }] }) } as any;
    }
    return {
      json: async () => ({
        data: posts.map((p) => ({ id: p.id, text: p.text, timestamp: p.timestamp, is_reply: false })),
        paging: {},
      }),
    } as any;
  });
}

const account = { threadsUserId: "u1", accessToken: "t", createdAt: CONNECT };

afterEach(() => vi.unstubAllGlobals());

describe("文体のお手本の選び方（2026-09-12・香取様の件）", () => {
  it("直近6か月に十分あるときは、表示数が多くても1年以上前の投稿は選ばない", async () => {
    // 古い投稿のほうが表示数は大きい（置かれている期間が長いぶん伸びている）
    const posts: FakePost[] = [
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `new${i}`,
        text: body(`いまの書き方${i}`),
        timestamp: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        views: 100,
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `old${i}`,
        text: body(`2025年の書き方${i}`),
        timestamp: `2025-03-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        views: 99999,
      })),
    ];
    stubThreads(posts);
    const { samples } = await collectOwnPostSamples(account);
    expect(samples.length).toBe(6);
    expect(samples.some((s) => s.includes("2025年の書き方"))).toBe(false);
  });

  it("直近6か月が少ないときは1年まで広げる", async () => {
    const posts: FakePost[] = [
      { id: "a", text: body("直近1"), timestamp: "2026-09-01T00:00:00.000Z", views: 10 },
      { id: "b", text: body("直近2"), timestamp: "2026-08-01T00:00:00.000Z", views: 10 },
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `m${i}`,
        text: body(`半年より前${i}`),
        timestamp: `2025-12-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        views: 50,
      })),
      { id: "z", text: body("2年前"), timestamp: "2024-05-01T00:00:00.000Z", views: 99999 },
    ];
    stubThreads(posts);
    const { samples } = await collectOwnPostSamples(account);
    expect(samples.some((s) => s.includes("2年前"))).toBe(false);
    expect(samples.some((s) => s.includes("半年より前"))).toBe(true);
  });

  it("新しい投稿が少ないアカウントでは、古くても取りこぼさない", async () => {
    const posts: FakePost[] = Array.from({ length: 4 }, (_, i) => ({
      id: `o${i}`,
      text: body(`昔の投稿${i}`),
      timestamp: `2024-0${i + 1}-01T00:00:00.000Z`,
      views: 5,
    }));
    stubThreads(posts);
    const { samples } = await collectOwnPostSamples(account);
    expect(samples.length).toBe(4);
  });

  it("連携日より後の投稿と、40字未満の投稿は見本にしない", async () => {
    const posts: FakePost[] = [
      { id: "future", text: body("連携後"), timestamp: "2026-09-11T00:00:00.000Z", views: 999 },
      { id: "short", text: "短い投稿", timestamp: "2026-09-01T00:00:00.000Z", views: 999 },
      { id: "ok", text: body("ふつうの投稿"), timestamp: "2026-09-02T00:00:00.000Z", views: 1 },
    ];
    stubThreads(posts);
    const { samples } = await collectOwnPostSamples(account);
    expect(samples).toEqual([body("ふつうの投稿")]);
  });
});

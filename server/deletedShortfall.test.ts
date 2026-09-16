import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Threads側で消された投稿の補填（deletedShortfall）が、連携30日以内のアカウントに掛からなかった（R10）。
 *
 * 2026-09-16 梅原様の @yusuke_seitai は連携の翌日に2件消されたが、
 * 補填の分岐が `days >= 30`（COMPENSATION_WINDOW_DAYS）を条件にしていたため返らなかった。
 * 連携直後に消された方こそ返す必要がある。
 *
 * あわせて、30日以内に慣らしの補填（compensationCount）が同じ不足を拾っているとき、
 * deletedShortfall を消化しないまま30日を過ぎると **同じ分をもう一度返して二重になる**。
 * 本数は増やさず、消化だけする（reason="deleted" が消化の合図）。
 */
vi.mock("./db", () => ({
  getThreadsAccountById: vi.fn(async () => ({ accessToken: null })), // 履歴照会は失敗＝「新規アカウント」扱い
  countAccountAutoPostsSinceConnect: vi.fn(async () => posted),
}));

let posted = 0;
const { rampForAccount } = await import("./accountRampCheck");

const DAY = 86400000;
let nextId = 9000;
/** 連携から days 日たったアカウント（id は毎回変える＝1日キャッシュを跨がせない） */
const acct = (days: number, over: Record<string, unknown> = {}) => ({
  id: nextId++, threadsUserId: "t", accessToken: "x",
  createdAt: new Date(Date.now() - days * DAY),
  extraPostsPerDay: 0, extraPostsUntil: null, extraPostsReason: null,
  cooldownUntil: null, deletedShortfall: 0, ...over,
});

describe("消された投稿の補填（R10）", () => {
  beforeEach(() => { posted = 0; });

  it("連携30日以内でも、慣らしが明けていれば契約＋1件で返す", async () => {
    posted = 12 * 1; // 契約どおり投稿できている＝慣らしの補填は乗らない
    const r = await rampForAccount(acct(12, { deletedShortfall: 2 }) as any, 1);
    expect(r.count).toBe(2);
    expect(r.reason).toBe("deleted");
    expect(r.note).toContain("消えた投稿の補填");
  });

  it("ライトプラン（契約1件）でも返る（慣らしの補填は want<2 で掛からないため）", async () => {
    posted = 12;
    const light = await rampForAccount(acct(12, { deletedShortfall: 1 }) as any, 1);
    expect(light.count).toBe(2);
    expect(light.extra).toBe(true);
  });

  it("慣らし運転中は増やさない（アカウントを守る側を優先する）", async () => {
    const r = await rampForAccount(acct(3, { deletedShortfall: 2 }) as any, 3);
    expect(r.capped).toBe(true);
    expect(r.count).toBe(1);        // 連携3日目は1日1件のまま
    expect(r.reason).not.toBe("deleted");
  });

  it("冷却中は増やさない（1日1件のまま）", async () => {
    const r = await rampForAccount(
      acct(12, { deletedShortfall: 2, cooldownUntil: new Date(Date.now() + 3 * DAY) }) as any, 3,
    );
    expect(r.count).toBe(1);
    expect(r.reason).toBe("cooldown");
  });

  it("慣らしの補填がすでに同じ不足を返しているときは、本数を増やさず消化だけする", async () => {
    posted = 3 * 12 - 5; // 契約3件×12日に5件足りない＝compensationCount が＋1件を返す
    const r = await rampForAccount(acct(12, { deletedShortfall: 2 }) as any, 3);
    expect(r.count).toBe(4);        // 3＋1。deletedShortfall のぶんをさらに足さない
    expect(r.reason).toBe("deleted"); // ＝ autoPostScheduler が deletedShortfall を1減らす
    expect(r.note).toContain("補填中");
  });

  it("消された投稿が無ければ、これまでどおり", async () => {
    posted = 3 * 12;
    const r = await rampForAccount(acct(12) as any, 3);
    expect(r.count).toBe(3);
    expect(r.extra).toBe(false);
    expect(r.reason).toBeUndefined();
  });

  it("30日を過ぎたアカウントは従来どおり契約＋1件で返す", async () => {
    const r = await rampForAccount(acct(40, { deletedShortfall: 3 }) as any, 3);
    expect(r.count).toBe(4);
    expect(r.reason).toBe("deleted");
  });
});

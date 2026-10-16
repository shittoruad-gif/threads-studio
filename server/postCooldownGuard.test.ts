import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 2026-10-16 acc22（@esthe_prestige_r）の3件目の削除を受けた2つの直し（三上様「それで進めて」）。
 *  1. 投稿が1件消えて「ご本人に確認中」のあいだも冷却に入れる。
 *     10/15 の #3595 で冷却が入らず、1日5件のまま走った。
 *  2. 冷却を手で解除した直後（冷却明け7日以内）は、足す本数を1日＋1件まで。
 *     10/14 に冷却を解除して 10/15 から＋2件で返した当日に、2件目が消えた。
 */

const calls = {
  update: [] as any[],
  defer: [] as any[],
  shortfall: [] as any[],
  pushed: [] as any[],
};
let executeRows: any[][] = [];
let accountRow: any = {};

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({ execute: vi.fn(async () => [executeRows.shift() ?? []]) })),
  isEndedCustomer: vi.fn(async () => false),
  getThreadsAccountById: vi.fn(async () => accountRow),
  updateThreadsAccountProfile: vi.fn(async () => undefined),
  updateThreadsAccount: vi.fn(async (id: number, v: any) => { calls.update.push({ id, ...v }); }),
  getLineUserIdsForUser: vi.fn(async () => ["U1"]),
  deferTodaysAutoPostsBeyond: vi.fn(async (id: number, n: number) => { calls.defer.push({ id, n }); return 2; }),
  addDeletedShortfall: vi.fn(async (id: number, n: number) => { calls.shortfall.push({ id, n }); }),
  countAccountAutoPostsSinceConnect: vi.fn(async () => 0),
}));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./lineNotify", () => ({ pushMessages: vi.fn(async (to: string, m: any) => { calls.pushed.push({ to, m }); }) }));

const { runAccountHealthJob } = await import("./accountHealthJob");
const { rampForAccount } = await import("./accountRampCheck");
const { recentlyOutOfCooldown, maxExtraPerDayFor, carryOverCount, jstDateString, COOLDOWN_DAYS } = await import("../shared/accountRamp");

/** /me は正常、投稿は goneIds だけ「does not exist」 */
function mockFetch(goneIds: string[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    json: async () => {
      if (url.includes("/me?")) return { id: "1", username: "esthe_prestige_r" };
      const id = url.split("/v1.0/")[1].split("?")[0];
      return goneIds.includes(id) ? { error: { message: "Object with ID does not exist" } } : { id };
    },
  })));
}

describe("1件消えてご本人に確認中のあいだも冷却に入れる（2026-10-16）", () => {
  beforeEach(() => {
    calls.update = []; calls.defer = []; calls.shortfall = []; calls.pushed = [];
  });

  it("お伺いと同時に7日間の冷却を入れ、今日の残りを1件に絞る。補填にはまだ積まない", async () => {
    executeRows = [[{ id: 22, userId: 500, threadsUsername: "esthe_prestige_r" }], [{ publishedThreadsPostId: "p1" }, { publishedThreadsPostId: "p2" }]];
    accountRow = { id: 22, userId: 500, accessToken: "tok", cooldownUntil: null, singleDeleteAskedAt: null };
    mockFetch(["p2"]);
    await runAccountHealthJob();
    const u = calls.update.find((x) => "singleDeleteAskedAt" in x);
    expect(u).toBeTruthy();
    expect(u.cooldownUntil).toBe(jstDateString(COOLDOWN_DAYS));
    expect(calls.defer).toEqual([{ id: 22, n: 1 }]);
    expect(calls.shortfall).toEqual([]); // 「消していません」のお答えで積む
    expect(calls.pushed.length).toBe(1); // お伺いの1通だけ
  });

  it("すでに冷却中なら、期限を縮めない（変えない）", async () => {
    const longer = jstDateString(COOLDOWN_DAYS + 5);
    executeRows = [[{ id: 22, userId: 500, threadsUsername: "esthe_prestige_r" }], [{ publishedThreadsPostId: "p1" }]];
    accountRow = { id: 22, userId: 500, accessToken: "tok", cooldownUntil: longer, singleDeleteAskedAt: null };
    mockFetch(["p1"]);
    await runAccountHealthJob();
    const u = calls.update.find((x) => "singleDeleteAskedAt" in x);
    expect(u).toBeTruthy();
    expect("cooldownUntil" in u).toBe(false);
  });
});

describe("冷却明け直後の補填は1日＋1件まで（2026-10-16）", () => {
  const today = "2026-10-15";

  it("冷却の最終日の翌日から7日間だけ「冷却明け直後」と見る", () => {
    expect(recentlyOutOfCooldown({ cooldownUntil: "2026-10-15" }, today)).toBe(false); // まだ冷却中
    expect(recentlyOutOfCooldown({ cooldownUntil: "2026-10-14" }, today)).toBe(true); // 10/14に手で解除→10/15
    expect(recentlyOutOfCooldown({ cooldownUntil: "2026-10-08" }, today)).toBe(true);
    expect(recentlyOutOfCooldown({ cooldownUntil: "2026-10-07" }, today)).toBe(false);
    expect(recentlyOutOfCooldown({ cooldownUntil: null }, today)).toBe(false);
    expect(maxExtraPerDayFor({ cooldownUntil: "2026-10-14" }, today)).toBe(1);
    expect(maxExtraPerDayFor({ cooldownUntil: null }, today)).toBe(2);
  });

  it("自動の繰り越しも冷却明け直後は＋1件まで", () => {
    const a = { shortfallDate: "2026-10-14", shortfallCount: 3 };
    expect(carryOverCount({ ...a, cooldownUntil: null }, 0, today)).toBe(2);
    expect(carryOverCount({ ...a, cooldownUntil: "2026-10-14" }, 0, today)).toBe(1);
  });

  it("運営の手動補填（＋2件）でも、冷却明け直後は契約＋1件に抑える（10/14 acc22 の再現）", async () => {
    const base = {
      threadsUserId: "t", accessToken: "x", createdAt: new Date(Date.now() - 60 * 86400000),
      extraPostsPerDay: 2, extraPostsUntil: jstDateString(3), extraPostsReason: "約束の残り",
      deletedShortfall: 0,
    };
    const justLifted = await rampForAccount({ ...base, id: 99101, cooldownUntil: jstDateString(-1) } as any, 3);
    expect(justLifted.count).toBe(4);
    const normal = await rampForAccount({ ...base, id: 99102, cooldownUntil: null } as any, 3);
    expect(normal.count).toBe(5);
  });
});

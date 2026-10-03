import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mapUnivapayStatus } from "./billingReconcile";

describe("billingReconcile: Univapayステータスの対応表", () => {
  it("課金中は active", () => {
    expect(mapUnivapayStatus("current")).toBe("active");
  });

  it("解約・完了は canceled", () => {
    expect(mapUnivapayStatus("canceled")).toBe("canceled");
    expect(mapUnivapayStatus("completed")).toBe("canceled");
  });

  it("未払い・停止は支払い遅延として扱う", () => {
    expect(mapUnivapayStatus("unpaid")).toBe("unpaid");
    expect(mapUnivapayStatus("suspended")).toBe("past_due");
  });

  it("カード登録直後（unconfirmed）は trialing", () => {
    expect(mapUnivapayStatus("unconfirmed")).toBe("trialing");
  });

  it("大文字small差を吸収する", () => {
    expect(mapUnivapayStatus("CURRENT")).toBe("active");
  });

  it("未知の値・空はnull（＝DBを書き換えない）", () => {
    expect(mapUnivapayStatus("なにこれ")).toBeNull();
    expect(mapUnivapayStatus("")).toBeNull();
    expect(mapUnivapayStatus(null)).toBeNull();
    expect(mapUnivapayStatus(undefined)).toBeNull();
  });

  it("返す値は subscriptions.status のenumに収まっている", () => {
    const allowed = ["trialing", "active", "canceled", "past_due", "unpaid", "incomplete"];
    for (const s of ["current", "unconfirmed", "canceled", "completed", "unpaid", "suspended"]) {
      const mapped = mapUnivapayStatus(s);
      expect(mapped).not.toBeNull();
      expect(allowed).toContain(mapped as string);
    }
  });
});

describe("billingReconcile: ジョブ本体", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("DBが無い環境では例外を投げず、何も照合しない", async () => {
    vi.doMock("./db", () => ({ getDb: async () => null }));
    vi.doMock("./univapay", () => ({ getSubscription: async () => ({ status: "current" }) }));
    vi.doMock("./_core/notification", () => ({ notifyOwner: async () => true }));

    const { runBillingReconcileJob } = await import("./billingReconcile");
    const r = await runBillingReconcileJob();
    expect(r.checked).toBe(0);
    expect(r.updated).toHaveLength(0);
  });

  it("Univapayが解約済みならDBを解約に直し、運営へ通知する", async () => {
    const updates: any[] = [];
    const notified: any[] = [];
    const fakeDb = {
      execute: async () => [[]],
      select: () => ({
        from: () => ({
          where: async () => [
            { id: 5, userId: 556, status: "trialing", univapaySubscriptionId: "sub_x" },
          ],
        }),
      }),
      update: () => ({
        set: (patch: any) => ({
          where: async () => {
            updates.push(patch);
          },
        }),
      }),
    };
    vi.doMock("./db", () => ({ getDb: async () => fakeDb }));
    vi.doMock("./univapay", () => ({
      getSubscription: async () => ({ status: "canceled", amount: 9800 }),
    }));
    vi.doMock("./_core/notification", () => ({
      notifyOwner: async (p: any) => {
        notified.push(p);
        return true;
      },
    }));

    const { runBillingReconcileJob } = await import("./billingReconcile");
    const r = await runBillingReconcileJob();

    expect(r.checked).toBe(1);
    expect(r.updated).toHaveLength(1);
    expect(r.updated[0]).toMatchObject({ subscriptionId: 5, from: "trialing", to: "canceled" });
    expect(updates[0].status).toBe("canceled");
    expect(notified).toHaveLength(1);
    expect(notified[0].title).toContain("課金の照合結果");
  });

  it("状態が一致していれば何も書き換えず、通知もしない", async () => {
    const updates: any[] = [];
    const notified: any[] = [];
    const fakeDb = {
      execute: async () => [[]],
      select: () => ({
        from: () => ({
          where: async () => [
            { id: 3, userId: 749, status: "active", univapaySubscriptionId: "sub_y" },
          ],
        }),
      }),
      update: () => ({ set: () => ({ where: async () => updates.push(1) }) }),
    };
    vi.doMock("./db", () => ({ getDb: async () => fakeDb }));
    vi.doMock("./univapay", () => ({ getSubscription: async () => ({ status: "current" }) }));
    vi.doMock("./_core/notification", () => ({
      notifyOwner: async (p: any) => {
        notified.push(p);
        return true;
      },
    }));

    const { runBillingReconcileJob } = await import("./billingReconcile");
    const r = await runBillingReconcileJob();

    expect(r.updated).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(notified).toHaveLength(0);
  });

  it("Univapayに無いIDでも落ちず、失敗として記録する", async () => {
    const fakeDb = {
      execute: async () => [[]],
      social: null,
      select: () => ({
        from: () => ({
          where: async () => [
            { id: 9, userId: 1, status: "trialing", univapaySubscriptionId: "test-selfcheck" },
          ],
        }),
      }),
      update: () => ({ set: () => ({ where: async () => {} }) }),
    };
    vi.doMock("./db", () => ({ getDb: async () => fakeDb }));
    vi.doMock("./univapay", () => ({
      getSubscription: async () => {
        throw new Error("Univapay API error: 404");
      },
    }));
    vi.doMock("./_core/notification", () => ({ notifyOwner: async () => true }));

    const { runBillingReconcileJob } = await import("./billingReconcile");
    const r = await runBillingReconcileJob();

    expect(r.checked).toBe(1);
    expect(r.updated).toHaveLength(0);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].subscriptionId).toBe(9);
  });

  it("解約の予約（cancelAtPeriodEnd）なのに UnivaPay が課金中なら、定期課金を止める。利用は期間の終わりまで active のまま", async () => {
    const updates: any[] = [];
    const canceled: string[] = [];
    const future = new Date(Date.now() + 5 * 86400_000);
    const fakeDb = {
      execute: async () => [[]],
      select: () => ({
        from: () => ({
          where: async () => [
            { id: 8, userId: 2907, status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: future, univapaySubscriptionId: "sub_h" },
            { id: 4, userId: 10, status: "active", cancelAtPeriodEnd: false, currentPeriodEnd: future, univapaySubscriptionId: "sub_n" },
          ],
        }),
      }),
      update: () => ({ set: (p: any) => ({ where: async () => updates.push(p) }) }),
    };
    vi.doMock("./db", () => ({ getDb: async () => fakeDb }));
    vi.doMock("./univapay", () => ({
      getSubscription: async () => ({ status: "current" }),
      cancelSubscription: async (id: string) => { canceled.push(id); },
    }));
    vi.doMock("./_core/notification", () => ({ notifyOwner: async () => true }));

    const { runBillingReconcileJob } = await import("./billingReconcile");
    const r = await runBillingReconcileJob();

    expect(canceled).toEqual(["sub_h"]);
    expect(updates).toHaveLength(0);
    expect(r.updated).toHaveLength(1);
    expect(r.updated[0].subscriptionId).toBe(8);
  });

  it("次回課金日（日本時間）→ その日の0:00。お支払いずみはその前日いっぱい", async () => {
    const { paidThroughFromDueDate } = await import("./billingReconcile");
    expect(paidThroughFromDueDate("2026-10-02")?.toISOString()).toBe("2026-10-01T15:00:00.000Z");
    expect(paidThroughFromDueDate(null)).toBeNull();
    expect(paidThroughFromDueDate("なし")).toBeNull();
  });
});

describe("billingReconcile: クーポンの無料体験の終わり（2026-10-03）", () => {
  beforeEach(() => { vi.resetModules(); });
  it("決済の契約が無い体験が終わっていたら canceled に落とす", async () => {
    const updates: any[] = [];
    const fakeDb = {
      execute: async () => [[{ id: 31, userId: 900 }]],
      select: () => ({ from: () => ({ where: async () => [] }) }),
      update: () => ({ set: (patch: any) => ({ where: async () => { updates.push(patch); } }) }),
    };
    vi.doMock("./db", () => ({ getDb: async () => fakeDb }));
    vi.doMock("./univapay", () => ({ getSubscription: async () => ({}) }));
    vi.doMock("./_core/notification", () => ({ notifyOwner: async () => true }));
    const { runBillingReconcileJob } = await import("./billingReconcile");
    const r = await runBillingReconcileJob();
    expect(r.updated).toEqual([{ subscriptionId: 31, userId: 900, from: "trialing", to: "canceled" }]);
    expect(updates).toEqual([{ status: "canceled" }]);
  });
});

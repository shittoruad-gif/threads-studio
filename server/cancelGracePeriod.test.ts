import { describe, it, expect } from "vitest";
import { resolveEffectivePlanId } from "../shared/plans";

/**
 * 「解約しても契約終了までは使える」の決まりごと（2026-09-22 三上様ご判断）。
 * 特定商取引法のページの記載と実装を合わせるための取り決め。
 */

/** 解約したときに status をどうするか（routers.ts の cancelSubscription と同じ判断） */
function statusOnCancel(currentPeriodEnd: Date | null, now = Date.now()): "active" | "canceled" {
  return currentPeriodEnd && currentPeriodEnd.getTime() > now ? "active" : "canceled";
}

/** 毎日の照合で、UnivaPayの canceled をそのまま写してよいか（billingReconcile と同じ判断） */
function shouldSyncCanceled(row: { cancelAtPeriodEnd: boolean; currentPeriodEnd: Date | null }, now = Date.now()): boolean {
  if (row.cancelAtPeriodEnd && row.currentPeriodEnd && row.currentPeriodEnd.getTime() > now) return false;
  return true;
}

const inFuture = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
const inPast = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

describe("解約しても契約終了までは使える", () => {
  it("お支払いずみの期間が残っていれば active のまま（投稿は止まらない）", () => {
    expect(statusOnCancel(inFuture)).toBe("active");
    expect(resolveEffectivePlanId("pro", "active")).toBe("pro");
  });

  it("期間が終わっていれば、その場で canceled（無料に落ちる）", () => {
    expect(statusOnCancel(inPast)).toBe("canceled");
    expect(statusOnCancel(null)).toBe("canceled");
    expect(resolveEffectivePlanId("pro", "canceled")).toBe("free");
  });

  it("毎日の照合は、猶予期間のあいだ canceled を写さない（途中で止めない）", () => {
    expect(shouldSyncCanceled({ cancelAtPeriodEnd: true, currentPeriodEnd: inFuture })).toBe(false);
  });

  it("期間が過ぎたら照合で canceled に落とす", () => {
    expect(shouldSyncCanceled({ cancelAtPeriodEnd: true, currentPeriodEnd: inPast })).toBe(true);
  });

  it("解約していない契約は、これまでどおり実態に合わせる", () => {
    expect(shouldSyncCanceled({ cancelAtPeriodEnd: false, currentPeriodEnd: inFuture })).toBe(true);
  });
});

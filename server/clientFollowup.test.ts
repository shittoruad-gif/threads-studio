import { describe, expect, it } from "vitest";
import { adminCard, decideStall, draftMessage, isBlockingStep, needsInternalFixOnly, stepLabel } from "../shared/clientFollowup";

const base = { stepKey: null, stepDays: 0, hasAccount: true, postedRecent: 0, daysSinceLastPost: null, daysSinceConnect: 30 };

describe("動いていないお客様の判定", () => {
  it("投稿が出ない工程のまま3日で setup", () => {
    expect(decideStall({ ...base, stepKey: "no_account", stepDays: 3, hasAccount: false })).toEqual({ reason: "setup", days: 3 });
    expect(decideStall({ ...base, stepKey: "no_account", stepDays: 2, hasAccount: false })).toBeNull();
    expect(decideStall({ ...base, stepKey: "acct_project:12", stepDays: 5 })).toEqual({ reason: "setup", days: 5 });
  });

  it("投稿が出ていれば、理想の投稿・URL・ピン留めが残っていても止まっているとは言わない", () => {
    for (const k of ["no_style_samples", "no_link", "pin_not_confirmed", "acct_pin:10", "profile_bio:3"]) {
      expect(isBlockingStep(k)).toBe(false);
      expect(decideStall({ ...base, stepKey: k, stepDays: 10, postedRecent: 5 })).toBeNull();
    }
  });

  it("設定は終わっているのに3日公開ゼロで silent", () => {
    expect(decideStall({ ...base, daysSinceLastPost: 4 })).toEqual({ reason: "silent", days: 4 });
    expect(decideStall({ ...base, daysSinceLastPost: 2 })).toBeNull();
  });

  it("連携したばかりの方は止まっているとは言わない", () => {
    expect(decideStall({ ...base, daysSinceConnect: 1 })).toBeNull();
  });

  it("冷却期間・公開の失敗・原因不明はお客様へ送る文を作らない", () => {
    expect(needsInternalFixOnly({ reason: "silent", silentCause: "cooldown" })).toBe(true);
    expect(needsInternalFixOnly({ reason: "silent", silentCause: "failed" })).toBe(true);
    expect(needsInternalFixOnly({ reason: "silent", silentCause: "approval" })).toBe(false);
    expect(needsInternalFixOnly({ reason: "setup" })).toBe(false);
  });
});

describe("文面", () => {
  it("英語のキーではなく日本語で出す", () => {
    expect(stepLabel("no_style_samples")).toBe("理想の投稿（お手本）が未登録");
    expect(stepLabel("no_link")).toBe("ご案内先URLが未登録");
    expect(stepLabel("project_almost")).toContain("お店の情報");
    expect(stepLabel("acct_pin:10", "@abc")).toBe("@abc：固定投稿のピン留めが未確認");
  });

  it("お客様への文：絵文字なし・事実と次の一歩、2回目はZoomの案内（プロ）", () => {
    const d1 = draftMessage({ userName: "山田", reason: "setup", stepKey: "no_account", days: 4, level: 1, proSupport: true });
    expect(d1).toContain("山田様");
    expect(d1).toContain("Threadsとの連携がまだ");
    expect(d1).not.toContain("Zoom");
    const d2 = draftMessage({ userName: "山田", reason: "setup", stepKey: "no_account", days: 8, level: 2, proSupport: true });
    expect(d2).toContain("Zoom");
    const light = draftMessage({ userName: "山田", reason: "setup", stepKey: "no_account", days: 8, level: 2, proSupport: false });
    expect(light).not.toContain("Zoom");
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(d1 + d2)).toBe(false);
    const s = draftMessage({ userName: "山田", reason: "silent", stepKey: null, days: 3, level: 1, proSupport: true, silentCause: "approval" });
    expect(s).toContain("3日ほど、投稿が公開されていない");
  });

  it("三上様への事実のまとめ", () => {
    const c = adminCard({ userName: "山田", planName: "プロプラン", reason: "setup", stepKey: "no_account", days: 5, stepSince: "2026-09-20",
      lastPostedAt: null, lastLineActiveDays: 2, level: 1 });
    expect(c).toContain("Threads未連携（5日前から・09/20〜）");
    expect(c).toContain("まだ1件もありません");
    expect(c).toContain("2日前");
  });
});

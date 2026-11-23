import { describe, it, expect } from "vitest";
import { inRecovery, recoveryPlanFor, ACCOUNT_RECOVERY } from "../shared/accountRecovery";
import { inOneSpot } from "../shared/oneSpotVariant";
import { inFeatureTrial } from "../shared/threadsFeatures";
import { inTreeDesign } from "../shared/treeDesign";

const at = (ymd: string) => Date.parse(`${ymd}T12:00:00+09:00`);

describe("閲覧の回復期間", () => {
  it("対象のアカウントだけ・期間中だけ", () => {
    const [id, p] = Object.entries(ACCOUNT_RECOVERY)[0]!;
    expect(inRecovery(Number(id), at(p.from))).toBe(true);
    expect(inRecovery(Number(id), at(p.until))).toBe(true);
    expect(inRecovery(Number(id), at("2099-01-01"))).toBe(false);
    expect(inRecovery(12, at(p.from))).toBe(false);
  });

  it("期間中は試し（1か所だけ・アンケート等・ツリー）に入らない。ほかのアカウントは変わらない", () => {
    const d = at("2026-11-28");
    expect(inOneSpot(10, d)).toBe(false);
    expect(inFeatureTrial(10, new Date(d))).toBe(false);
    expect(inTreeDesign(10, d)).toBe(false);
    expect(inTreeDesign(12, d)).toBe(true);
    expect(inOneSpot(12, d)).toBe(true);
  });
});

import { stepUpPerDay } from "../shared/accountRecovery";
import { computeDailyCap } from "../shared/dailyCap";

describe("本数を段階的に戻す（金光）", () => {
  it("11/24から8本・12/01から10本・開始前とほかのアカウントは null", () => {
    expect(stepUpPerDay(12, "2026-10-26", at("2026-11-23"))).toBeNull();
    expect(stepUpPerDay(12, "2026-10-26", at("2026-11-24"))).toBe(8);
    expect(stepUpPerDay(12, "2026-10-26", at("2026-11-30"))).toBe(8);
    expect(stepUpPerDay(12, "2026-10-26", at("2026-12-01"))).toBe(10);
    expect(stepUpPerDay(12, null, at("2026-12-20"))).toBe(10);
    expect(stepUpPerDay(36, null, at("2026-12-01"))).toBeNull();
  });
  it("玉島：冷却（〜11/25）が明けてから 5→8→10", () => {
    expect(stepUpPerDay(10, "2026-11-25", at("2026-11-25"))).toBeNull();
    expect(stepUpPerDay(10, "2026-11-25", at("2026-11-26"))).toBe(5);
    expect(stepUpPerDay(10, "2026-11-25", at("2026-11-29"))).toBe(8);
    expect(stepUpPerDay(10, "2026-11-25", at("2026-12-06"))).toBe(10);
    expect(stepUpPerDay(10, "2026-11-30", at("2026-12-06"))).toBeNull();
  });
  it("段階の途中で冷却に入ったら、冷却明けも元へ戻す", () => {
    expect(stepUpPerDay(12, "2026-11-27", at("2026-12-05"))).toBeNull();
  });
  it("天井も一緒に上がる（翌日へ回されない）", () => {
    expect(computeDailyCap({ contract: 3, rampCount: 8, rampCapped: false, carry: 0, maxExtra: Math.max(2, 8 - 3) } as any)).toBe(8);
  });
});

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
    expect(recoveryPlanFor(Number(id), at(p.from))?.perDay).toBeLessThanOrEqual(2);
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

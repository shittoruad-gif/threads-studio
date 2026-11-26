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
    // 11/26 三上様「それで進めて」：5本で止める（8本・10本へは上げない）
    expect(stepUpPerDay(10, "2026-11-25", at("2026-11-29"))).toBe(5);
    expect(stepUpPerDay(10, "2026-11-25", at("2026-12-06"))).toBe(5);
    expect(stepUpPerDay(10, "2026-11-30", at("2026-12-06"))).toBeNull();
  });
  it("段階の途中で冷却に入ったら、冷却明けも元へ戻す", () => {
    expect(stepUpPerDay(12, "2026-11-27", at("2026-12-05"))).toBeNull();
  });
  it("天井も一緒に上がる（翌日へ回されない）", () => {
    expect(computeDailyCap({ contract: 3, rampCount: 8, rampCapped: false, carry: 0, maxExtra: Math.max(2, 8 - 3) } as any)).toBe(8);
  });
});

describe("玉島の回復期間：宣伝の文と使い古した書き出しを作り直す（2026-11-26）", () => {
  it("11/26 に出た宣伝の文・冷え込みの書き出しは作り直しになる", async () => {
    const { recoveryReject, RECOVERY_SKIP_ANGLES } = await import("../shared/accountRecovery");
    const d = at("2026-11-27");
    expect(recoveryReject(10, "「体が硬いからピラティスは無理」\nそう思われがちです。\n国家資格者が体の状態を見て、個別に進めます。", d)?.kind).toBe("promo");
    expect(recoveryReject(10, "プロ野球選手やパラ卓球日本代表の指導実績があります。", d)?.kind).toBe("promo");
    expect(recoveryReject(10, "朝晩の冷え込みで体が固まるこの時期、姿勢が気になりませんか？", d)?.kind).toBe("opener");
    expect(recoveryReject(10, "玉島で好きな冬の味覚、何ですか？", d)).toBeNull();
    expect(recoveryReject(10, "玉島中央町を歩くとき、ふと姿勢が気になります。\n少し意識するだけで、体は変わってきます。", d)).toBeNull();
    // 期間外・ほかのアカウントには効かない
    expect(recoveryReject(10, "国家資格者がご案内しています。", at("2026-12-08"))).toBeNull();
    expect(recoveryReject(12, "国家資格者がご案内しています。", d)).toBeNull();
    expect(RECOVERY_SKIP_ANGLES).toContain("number_result");
  });
});


describe("閲覧の落ち込みを自動で見つける（2026-11-26）", () => {
  it("直近7日の中央値が、前8週でいちばん良かった週の35%未満なら落ち込み。数が少ない・もともと小さいときは判定しない", async () => {
    const { isSlumping, setAutoRecovery, inRecovery, recoveryReject } = await import("../shared/accountRecovery");
    const wk = (v: number, n = 7) => Array.from({ length: n }, () => v);
    // 落ちたまま戻らない（前の週も低い）でも、良かった週と比べて拾う
    expect(isSlumping(wk(6, 18), [wk(7), wk(15), wk(29), wk(64), wk(112), wk(218)])).toBe(true);
    expect(isSlumping(wk(60), [wk(100), wk(90)])).toBe(false);
    expect(isSlumping(wk(5, 3), [wk(100)])).toBe(false);
    expect(isSlumping(wk(1), [wk(10), wk(12)])).toBe(false);
    // 2本しかない週の当たりは、良かった週に数えない
    expect(isSlumping(wk(10), [wk(5000, 2), wk(20)])).toBe(false);
    const d = at("2026-11-27");
    setAutoRecovery(new Map([[16, { from: "2026-11-27", until: "2026-12-11", perDay: null, auto: true }]]));
    expect(inRecovery(16, d)).toBe(true);
    // お客様の予約の案内は消さない。使い古した書き出しだけ作り直す
    expect(recoveryReject(16, "当院では、国家資格者がお待ちしています。ご予約はプロフィールから。", d)).toBeNull();
    expect(recoveryReject(16, "朝晩の冷え込みで肩がこる季節です。", d)?.kind).toBe("opener");
    const { recoveryNoteFor } = await import("../shared/accountRecovery");
    expect(recoveryNoteFor(16, d)).toMatch(/60字前後/);
    expect(recoveryNoteFor(10, d)).toMatch(/宣伝の文/);
    expect(recoveryNoteFor(36, d)).toBe("");
    expect(inRecovery(16, at("2026-12-12"))).toBe(false);
    setAutoRecovery(new Map());
    expect(inRecovery(16, d)).toBe(false);
  });
});

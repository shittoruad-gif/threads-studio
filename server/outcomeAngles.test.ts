import { describe, it, expect } from "vitest";
import { pickAngle, OUTCOME_RISK_ANGLES, activeAngles } from "../shared/postAngles";

/**
 * 健康系のお店の新しいアカウントに、結果を語る切り口を割り当てない
 * （2026-09-08 @haisaiseikotsuin：整骨院・連携2日目で公開3件がThreads側で削除。
 *   消された投稿も承認待ちの投稿も change_story / customer_voice だった）。
 */
describe("結果を語る切り口の除外", () => {
  const stats = {};

  it("除外を指定すると、何回引いてもビフォーアフター・お客様の声は出ない", () => {
    for (let i = 0; i < 400; i++) {
      const a = pickAngle(stats, () => i / 400, undefined, Date.now(), "store", { excludeOutcomeAngles: true });
      expect(OUTCOME_RISK_ANGLES).not.toContain(a.id);
    }
  });

  it("除外しなければ、これまでどおり候補に残る", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 400; i++) {
      ids.add(pickAngle(stats, () => i / 400, undefined, Date.now(), "store").id);
    }
    // 集中検証期間中かどうかに関わらず、母集団に結果系が含まれていれば出うる
    const pool = activeAngles(Date.now(), "store").map((a) => a.id);
    const outcomeInPool = OUTCOME_RISK_ANGLES.filter((x) => pool.includes(x));
    if (outcomeInPool.length > 0) {
      expect(outcomeInPool.some((x) => ids.has(x))).toBe(true);
    }
  });

  it("除外しても必ず1つは切り口が返る", () => {
    const a = pickAngle(stats, () => 0.99, undefined, Date.now(), "store", { excludeOutcomeAngles: true });
    expect(a).toBeTruthy();
    expect(typeof a.id).toBe("string");
  });
});

/**
 * ◯✕評価の好み（既存）と、手直しの好み（新規）は別物として両方渡す。
 * 変数名がぶつかると評価の学習が黙って消えるので、実装の形を固定する。
 */
describe("好みの注入が両方生きている", () => {
  it("autoPostScheduler が評価の好みと手直しの好みを別の変数で扱っている", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(new URL("./autoPostScheduler.ts", import.meta.url), "utf-8");
    // ◯✕評価の好みはプロンプト本文に連結される
    expect(src).toMatch(/\+ preferenceNote/);
    // 手直しの好みは別名で、generateThreadsPrompt に渡す
    expect(src).toContain("editPreferenceNote");
    expect(src).toMatch(/preferenceNote: editPreferenceNote/);
    // 内側で preferenceNote を再宣言していない（再宣言すると評価の学習が消える）
    expect(src).not.toMatch(/\n\s+let preferenceNote = '';[\s\S]{0,400}buildPreferenceNote/);
  });
});

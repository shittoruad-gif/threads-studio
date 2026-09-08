import { describe, it, expect } from "vitest";
import { normalizePreferredTypes, preferredAngleIds } from "../shared/preferredAngles";
import { pickAngle } from "../shared/postAngles";

describe("希望の型を切り口に反映する", () => {
  it("LINEの設定で入る表示名も、アプリの id も同じに読む", () => {
    expect(normalizePreferredTypes(["地元ネタ型", "実績・体験談型", "ストーリー型", "専門性型", "Q&A型"]))
      .toEqual(["local", "proof", "story", "expertise", "qa"]);
    expect(normalizePreferredTypes("local,proof,empathy")).toEqual(["local", "proof", "empathy"]);
  });

  it("健康系の新しいアカウントでは、体験談を『数字・実績』だけに寄せる", () => {
    expect(preferredAngleIds(["実績・体験談型"], { excludeOutcomeAngles: true })).toEqual(["number_result"]);
    expect(preferredAngleIds(["実績・体験談型"])).toEqual(["number_result", "change_story", "customer_voice"]);
  });

  it("希望の切り口が明らかに多く選ばれる（地元ネタ型だけ登録）", () => {
    const preferred = preferredAngleIds(["地元ネタ型"]);
    let hits = 0;
    const N = 600;
    for (let i = 0; i < N; i++) {
      const a = pickAngle({}, () => (i + 0.5) / N, undefined, Date.now(), "store", { preferredAngles: preferred });
      if (a.id === "local") hits++;
    }
    // 希望なしなら 1/8〜1/19 程度。希望ありで 3割以上になっていること
    expect(hits / N).toBeGreaterThan(0.3);
  });

  it("集中検証期間中でも、希望の切り口は候補に入る", () => {
    // 2026-09-10（ANGLE_FOCUS の期限内）に「Q&A型」を希望した場合、qa が出うる
    const now = Date.parse("2026-09-10T12:00:00+09:00");
    const ids = new Set<string>();
    for (let i = 0; i < 300; i++) ids.add(pickAngle({}, () => (i + 0.5) / 300, undefined, now, "store", { preferredAngles: ["qa"] }).id);
    expect(ids.has("qa")).toBe(true);
  });
});

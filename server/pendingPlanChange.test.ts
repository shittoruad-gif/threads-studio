import { describe, it, expect } from "vitest";
import { getPlan, resolveEffectivePlanId } from "../shared/plans";

/**
 * 「金額も機能も次回の請求から」プラン変更の決まりごと（2026-09-22 三上様ご判断）。
 * webhook 側の切り替え判断をそのまま写した関数で、決まりごとを固定しておく。
 */
function planIdOnCharge(args: {
  pendingPlanId?: string | null;
  matchedPlanId?: string | null;
  existingPlanId?: string | null;
}): string | null {
  const pending = args.pendingPlanId && getPlan(args.pendingPlanId) ? args.pendingPlanId : null;
  return pending ?? args.matchedPlanId ?? args.existingPlanId ?? null;
}

describe("次回の請求から切り替えるプラン変更", () => {
  it("予約があれば、金額一致の推定より予約を優先する", () => {
    expect(planIdOnCharge({ pendingPlanId: "light", matchedPlanId: "pro", existingPlanId: "pro_seminar" }))
      .toBe("light");
  });

  it("予約が無ければ、これまでどおり金額一致→今のプランの順", () => {
    expect(planIdOnCharge({ matchedPlanId: "pro", existingPlanId: "pro_seminar" })).toBe("pro");
    expect(planIdOnCharge({ existingPlanId: "pro_seminar" })).toBe("pro_seminar");
  });

  it("存在しないプランが予約に残っていても、それには切り替えない", () => {
    expect(planIdOnCharge({ pendingPlanId: "nope", matchedPlanId: "pro", existingPlanId: "light" }))
      .toBe("pro");
  });

  it("セミナー価格からライトへ下げても、切り替わるまでは今のプランの機能", () => {
    // 予約中は planId が pro_seminar のままなので、実効プランもプロのまま
    expect(resolveEffectivePlanId("pro_seminar", "active")).toBe("pro_seminar");
    expect(getPlan("pro_seminar")?.features.maxAutoPostsPerDay).toBe(3);
    // 切り替わったあとはライトの1日1回
    expect(getPlan("light")?.features.maxAutoPostsPerDay).toBe(1);
  });

  it("特別価格“へ”の変更は受けない（申込コードをお持ちの方だけの価格のため）", () => {
    expect(getPlan("pro_seminar")?.isCampaign).toBe(true);
    expect(getPlan("light")?.isCampaign).toBeFalsy();
  });
});

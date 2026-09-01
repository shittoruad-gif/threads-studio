import { describe, it, expect } from "vitest";
import { settingsSummary, settingsQuick } from "./lineChat";
import { PLANS } from "../shared/plans";

/** すべてのプランで、LINEの設定表示が破綻しないことを確かめる */
describe("全プランでのLINE設定表示", () => {
  const planIds = Object.keys(PLANS);

  it("すべてのプランで要約が作れて、上限が正しく出る", () => {
    for (const id of planIds) {
      const plan: any = (PLANS as any)[id];
      const maxPerDay = plan.features.maxAutoPostsPerDay;
      const text = settingsSummary(
        { autoPostEnabled: true, autoPostRequireApproval: true, postLength: "short", autoPostFrequency: "three_daily" },
        { maxPerDay, planName: plan.name },
      );
      expect(text).toContain(plan.name);
      if (maxPerDay <= 0) {
        // 自動投稿が無いプランで「ON」と言ってはいけない
        expect(text).toContain("使えません");
        expect(text).not.toContain("1日3回）");
      } else {
        expect(text).toContain(`1日${Math.min(3, maxPerDay)}回`);
      }
    }
  });

  it("自動投稿が使えないプランでは、その切り替えを出さない", () => {
    const free: any = (PLANS as any).free;
    const items = settingsQuick({ autoPostEnabled: false }, free.features.maxAutoPostsPerDay);
    expect(items.some((i) => i.data.startsWith("s=auto"))).toBe(false);
    expect(items.some((i) => i.data === "s=plan")).toBe(true);
  });

  it("使えるプランでは自動投稿の切り替えが出る", () => {
    for (const id of ["light", "pro", "business", "agency"]) {
      const plan: any = (PLANS as any)[id];
      if (!plan) continue;
      const items = settingsQuick({ autoPostEnabled: false }, plan.features.maxAutoPostsPerDay);
      expect(items.some((i) => i.data === "s=auto&v=on")).toBe(true);
    }
  });

  it("プラン上限より多く設定していても、実際の回数で表示する", () => {
    const light: any = (PLANS as any).light;
    const t = settingsSummary(
      { autoPostEnabled: true, autoPostFrequency: "three_daily" },
      { maxPerDay: light.features.maxAutoPostsPerDay, planName: light.name },
    );
    expect(t).toContain("1日1回");
    expect(t).toContain("上限は1日1回");
  });
});

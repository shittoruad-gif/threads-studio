import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * プランを上げたときに自動投稿の回数が上限まで上がることの確認。
 * DBは差し替えて、読み書きの内容だけを見る。
 */
const state: { frequency: string | null; saved: any[] } = { frequency: "daily", saved: [] };

vi.mock("./db", () => ({
  getAutoPostSettings: vi.fn(async () => ({ autoPostFrequency: state.frequency })),
  updateAutoPostSettings: vi.fn(async (_userId: number, s: any) => { state.saved.push(s); state.frequency = s.autoPostFrequency; }),
}));

const { raiseAutoPostFrequencyOnUpgrade } = await import("./planUpgrade");

beforeEach(() => { state.frequency = "daily"; state.saved = []; });

describe("プラン変更にともなう自動投稿回数の引き上げ", () => {
  it("フリーからプロに切り替えたら、1日3回になる", async () => {
    const raised = await raiseAutoPostFrequencyOnUpgrade(1, "free", "pro");
    expect(raised).toBe(true);
    expect(state.saved).toEqual([{ autoPostFrequency: "three_daily" }]);
  });

  it("セミナー価格・キャンペーン価格のプロでも同じように上がる", async () => {
    expect(await raiseAutoPostFrequencyOnUpgrade(1, "free", "pro_seminar")).toBe(true);
    expect(state.frequency).toBe("three_daily");
    state.frequency = "daily";
    expect(await raiseAutoPostFrequencyOnUpgrade(1, "free", "pro_campaign")).toBe(true);
    expect(state.frequency).toBe("three_daily");
  });

  it("ライトは1日1回のままで、勝手に増やさない", async () => {
    expect(await raiseAutoPostFrequencyOnUpgrade(1, "free", "light")).toBe(false);
    expect(state.saved).toEqual([]);
  });

  it("同じプランでの毎月の課金では、ご本人が下げた設定を戻さない", async () => {
    state.frequency = "daily"; // プロだが「1日1回でいい」とご本人が下げた状態
    const raised = await raiseAutoPostFrequencyOnUpgrade(1, "pro", "pro");
    expect(raised).toBe(false);
    expect(state.saved).toEqual([]);
  });

  it("プロからライトへ下げたときは触らない", async () => {
    state.frequency = "three_daily";
    expect(await raiseAutoPostFrequencyOnUpgrade(1, "pro", "light")).toBe(false);
    expect(state.frequency).toBe("three_daily");
  });

  it("すでに1日3回に設定済みなら、書き込みをしない", async () => {
    state.frequency = "three_daily";
    expect(await raiseAutoPostFrequencyOnUpgrade(1, "free", "pro")).toBe(false);
    expect(state.saved).toEqual([]);
  });

  it("ライトからプロへの変更でも上がる", async () => {
    expect(await raiseAutoPostFrequencyOnUpgrade(1, "light", "pro")).toBe(true);
    expect(state.frequency).toBe("three_daily");
  });
});

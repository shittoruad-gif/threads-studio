import { describe, it, expect, vi, beforeEach } from "vitest";
import { SURVEY_ANGLE_POOL, WEEKLY_SURVEY, isWeeklySurveyTarget, surveyAngleOrder, surveyIntro, adminPreviewText } from "../shared/draftSurveyWeekly";
import { OUTCOME_RISK_ANGLES } from "../shared/postAngles";

// 2026-09-29 三上様指示「まずは型Bを定期的に」：見送りが続き公開もある方へ、週1回8案の◯✕。
describe("週1回の◯✕アンケート：判断", () => {
  it("型B（見送り3回以上・公開1件以上）だけが対象。公開0件の方（型A）は対象外", () => {
    expect(isWeeklySurveyTarget({ declines: 13, published: 19 }, 3)).toBe(true); // プレステージ様 9/28
    expect(isWeeklySurveyTarget({ declines: 9, published: 0 }, 3)).toBe(false); // 香取様 9/28
    expect(isWeeklySurveyTarget({ declines: 2, published: 10 }, 3)).toBe(false);
  });

  it("切り口の候補に、結果を語る切り口は入れない。8つ以上ある", () => {
    for (const a of OUTCOME_RISK_ANGLES) expect(SURVEY_ANGLE_POOL).not.toContain(a);
    expect(SURVEY_ANGLE_POOL.length).toBeGreaterThanOrEqual(WEEKLY_SURVEY.size + 4);
  });

  it("✕が付いた切り口は後ろへ。週ごとに先頭がずれる", () => {
    const o = surveyAngleOrder(["behind_scenes"], 0);
    expect(o[o.length - 1]).toBe("behind_scenes");
    expect(o).toHaveLength(SURVEY_ANGLE_POOL.length);
    expect(surveyAngleOrder([], 0).slice(0, 8)).not.toEqual(surveyAngleOrder([], 1).slice(0, 8));
  });

  it("前置きと下見の文", () => {
    expect(surveyIntro("プレステージ", 8)).toContain("プレステージ様らしく");
    expect(surveyIntro("", 8)).toContain("お店らしく");
    const t = adminPreviewText({ userName: "株式会社プレステージ", username: "esthe_prestige_r", declines: 13, published: 19,
      drafts: Array.from({ length: 8 }, (_, i) => ({ label: `型${i}`, content: "あ".repeat(500) })) });
    expect(t).toContain("見送り13回／公開19件");
    expect(t).toContain("案8");
    expect(t.length).toBeLessThanOrEqual(4900);
  });
});

// ── 三上様の「この8案を送る」：二度押しでも1回だけ送る ──
const state = { status: "pending" as string };
const pushMessages = vi.fn(async () => true);
vi.mock("./lineNotify", () => ({ pushMessages }));
vi.mock("./db", () => ({
  getDb: async () => ({
    execute: async (q: any) => {
      const text = JSON.stringify(q);
      if (text.includes("UPDATE") && text.includes("'sent'")) {
        if (state.status !== "pending") return [{ affectedRows: 0 }];
        state.status = "sent"; return [{ affectedRows: 1 }];
      }
      if (text.includes("UPDATE") && text.includes("'skipped'")) {
        if (state.status !== "pending") return [{ affectedRows: 0 }];
        state.status = "skipped"; return [{ affectedRows: 1 }];
      }
      if (text.includes("UPDATE") && text.includes("'pending'")) { state.status = "pending"; return [{ affectedRows: 1 }]; }
      if (text.includes("SELECT")) return [[1, 2].map((id) => ({ id, userId: 7, projectId: "p", angle: "qa", label: "Q&A", content: `案${id}`, status: state.status }))];
      return [{ affectedRows: 0 }];
    },
  }),
  getProjectById: async () => ({ storeName: "プレステージ" }),
  getLineUserIdsForUser: async () => ["Ucustomer"],
}));

describe("週1回の◯✕アンケート：三上様の判断", () => {
  beforeEach(() => { state.status = "pending"; pushMessages.mockClear(); });

  it("「送る」を2回押しても、お客様へは1回だけ", async () => {
    const { decideWeeklySurvey } = await import("./draftSurveyWeekly");
    expect(await decideWeeklySurvey("sv-22-x", "send", 1)).toContain("お送りしました");
    expect(await decideWeeklySurvey("sv-22-x", "send", 1)).toContain("すでに処理ずみ");
    expect(pushMessages).toHaveBeenCalledTimes(1);
  });

  it("「今回は送らない」ならお客様へは何も届かない", async () => {
    const { decideWeeklySurvey } = await import("./draftSurveyWeekly");
    expect(await decideWeeklySurvey("sv-22-x", "skip", 1)).toContain("お送りしません");
    expect(await decideWeeklySurvey("sv-22-x", "send", 1)).toContain("すでに処理ずみ");
    expect(pushMessages).not.toHaveBeenCalled();
  });

  it("送れなかったときは判断待ちに戻す（押し直せる）", async () => {
    pushMessages.mockResolvedValueOnce(false as any);
    const { decideWeeklySurvey } = await import("./draftSurveyWeekly");
    expect(await decideWeeklySurvey("sv-22-x", "send", 1)).toContain("送れませんでした");
    expect(state.status).toBe("pending");
  });
});

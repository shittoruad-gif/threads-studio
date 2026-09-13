import { describe, it, expect, vi } from "vitest";

/**
 * 「はじめの設定」を終えた直後に「固定投稿を作る」を押したときの返し方。
 *
 * ★まず5つ（URL＋業種・場所・店名・お悩み）だけ答えた方は、お客さん像と強みが空のまま。
 *   それを「まだお店の情報が登録されていないため、先にはじめの設定を」と返していたため、
 *   たった今やり終えたことをもう一度やらされる形になっていた（2026-09-14 夜間整備の通し確認）。
 */
const accounts = [{ id: 1, isActive: true, threadsUsername: "qa", accessToken: "x" }];
let projects: any[] = [];

vi.mock("./db", () => ({
  getThreadsAccountsByUserId: vi.fn(async () => accounts),
  getUserProjects: vi.fn(async () => projects),
}));

const { createPinnedDraft } = await import("./pinnedPostFlow");

const base = { id: "line_1", businessType: "整体院", area: "岡山県倉敷市玉島", mainProblem: "肩こり・腰痛" };

describe("固定投稿：あと2問のご案内（2026-09-14）", () => {
  it("お客さん像と強みだけが空なら、「はじめの設定をやり直す」ではなく2問へ案内する", async () => {
    projects = [{ ...base, target: null, strength: null }];
    const r: any = await createPinnedDraft(1);
    expect(r.error).toContain("お客さん像");
    expect(r.error).toContain("強み");
    expect(r.error).not.toContain("まだ「お店の情報」が登録されていない");
    expect(r.needMoreField).toBe("targetRaw");
    expect(r.projectId).toBe("line_1");
  });

  it("強みだけ空なら、強みの1問へ案内する", async () => {
    projects = [{ ...base, target: "デスクワークの会社員", strength: null }];
    const r: any = await createPinnedDraft(1);
    expect(r.error).toContain("強み");
    expect(r.error).not.toContain("お客さん像");
    expect(r.needMoreField).toBe("strengthRaw");
  });

  it("本当に何も登録されていなければ、今までどおり「はじめの設定」へ", async () => {
    projects = [];
    const r: any = await createPinnedDraft(1);
    expect(r.error).toContain("まだ「お店の情報」が登録されていない");
    expect(r.needMoreField).toBeUndefined();
  });

  it("お試し用（demo_）のお店は数えない", async () => {
    projects = [{ id: "demo_1", businessType: "整体院", area: "岡山", mainProblem: "肩こり", target: "A", strength: "B" }];
    const r: any = await createPinnedDraft(1);
    expect(r.error).toContain("まだ「お店の情報」が登録されていない");
  });

  it("Threadsが未連携なら、そちらを先にご案内する", async () => {
    const db: any = await import("./db");
    db.getThreadsAccountsByUserId.mockResolvedValueOnce([]);
    projects = [{ ...base, target: null, strength: null }];
    const r: any = await createPinnedDraft(1);
    expect(r.error).toContain("アカウント連携");
  });
});

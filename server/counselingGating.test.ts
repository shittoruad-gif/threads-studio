import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 「あと2問だけ答える」で1問しか受け取れていなかった（2026-09-16 未明の通し確認）。
 *
 * 「次にやること」は5問を終えた方に
 *   「お店の情報は『お客さん像』と『強み』だけ空いています。下のボタンから、2問にお答えください」
 * と案内するのに、1問答えた時点で `moreOne` で終わっていた。
 * お客様がそのまま2問目を送ると、はじめの設定の続きとしては受け取られず、
 * ご質問として自動応答に流れて **お答えがそのまま消えていた**（強みは空のまま）。
 * 自動投稿はお客さん像と強みが揃うまで始まらないので、ここで止まると投稿はゼロのまま。
 */
vi.mock("./lineNotify", () => ({ pushLine: vi.fn(), replyLine: vi.fn(), pushLineWithButtons: vi.fn() }));

const LINE_USER = "Ugatingtest";
let project: any;
let state: any = null;

// この道で使う分だけ本物らしく振る舞わせ、それ以外は「何もしない」で通す
vi.mock("./db", () => {
  const impl: Record<string, any> = {
    getUserByLineUserId: async () => ({ id: 1, email: "qa@example.com", name: "QA" }),
    getUserProjects: async () => [project],
    getProjectById: async () => project,
    getLineChatState: async () => state,
    getLineChatStateIgnoringTtl: async () => state,
    setLineChatState: async (_u: string, s: string, d: string) => { state = { state: s, payload: d, ageMin: 0 } as any; },
    clearLineChatState: async () => { state = null; },
    getThreadsAccountsByUserId: async () => [],
    getActiveThreadsAccounts: async () => [],
    getSubscriptionByUserId: async () => ({ planId: "pro", status: "active" }),
  };
  // 触るだけで落ちないよう、この道で呼ばれる残りは「何もしない」で埋める
  for (const name of [
    "counselingBackupKey", "setCounselingBackup", "getCounselingBackup", "clearCounselingBackup",
    "setLineFollowerOptOut", "getScheduledPostsByUser", "createSupportQuestion", "getUserById",
    "updateProject", "getLineFollower", "logEvent", "findOwnRecentPostByContent",
  ]) impl[name] ??= async () => undefined;
  return impl;
});

// 保存は本物を通さず、列に書き込まれたことだけを見る
vi.mock("./counselingSave", () => ({
  saveCounselingAnswers: vi.fn(async ({ answers }: any) => {
    if (answers.targetRaw) project.target = answers.targetRaw;
    if (answers.strengthRaw) project.strength = answers.strengthRaw;
    project.counselingResult = JSON.stringify({ rawAnswers: answers });
    return { ok: true };
  }),
}));

const handler: any = await import("./lineChatHandler");

const textOf = (res: any) => (Array.isArray(res) ? res : [res])
  .map((m: any) => String(m?.text ?? m?.altText ?? "")).join("\n");

describe("あと2問（自動投稿に足りない必須項目）を最後まで受け取る", () => {
  beforeEach(() => {
    state = null;
    project = {
      id: "line_qa1", mode: "store", businessType: "整体院", area: "岡山県倉敷市玉島",
      storeName: "よる整体院", mainProblem: "夕方に腰が重くなること",
      target: null, strength: null, counselingResult: null,
    };
  });

  it("1問目を答えたら、そのまま2問目（強み）を聞く", async () => {
    const first = await handler.handlePostback(LINE_USER, "c=more&p=line_qa1&f=targetRaw");
    expect(textOf(first)).toContain("あと2問");
    expect(textOf(first)).toContain("どんなお客さん");

    const second = await handler.handleFreeText(LINE_USER, "長く座って仕事をする40〜60代の女性");
    expect(project.target).toBe("長く座って仕事をする40〜60代の女性");
    // ここで終わらせない（以前は「1問追加しました」で会話が切れていた）
    expect(textOf(second)).toContain("あと1問");
    expect(textOf(second)).not.toContain("1問追加しました");

    const third = await handler.handleFreeText(LINE_USER, "完全予約制で一人ずつゆっくり見ます");
    expect(project.strength).toBe("完全予約制で一人ずつゆっくり見ます");
    expect(textOf(third)).toContain("自動投稿の準備がそろいました");
  });

  it("必須が1つだけ空なら、1問で終わる", async () => {
    project.target = "デスクワークの会社員";
    const first = await handler.handlePostback(LINE_USER, "c=more&p=line_qa1&f=strengthRaw");
    expect(textOf(first)).toContain("あと1問");
    const done = await handler.handleFreeText(LINE_USER, "完全予約制でゆったり見ます");
    expect(project.strength).toBe("完全予約制でゆったり見ます");
    expect(textOf(done)).toContain("自動投稿の準備がそろいました");
  });

  it("必須がそろっている方の「きょうの1問」は、これまでどおり1問で終わる", async () => {
    project.target = "デスクワークの会社員";
    project.strength = "完全予約制";
    const first = await handler.handlePostback(LINE_USER, "c=more&p=line_qa1");
    expect(textOf(first)).toContain("きょうの1問");
    const done = await handler.handleFreeText(LINE_USER, "丁寧な敬語で、少しやわらかく");
    expect(textOf(done)).toContain("1問追加しました");
  });

  it("案内した項目と違う質問を出さない（列だけ空で、答えが残っている場合）", async () => {
    // アプリ側で強みを消した方。counselingResult には答えが残っている
    project.target = "デスクワークの会社員";
    project.counselingResult = JSON.stringify({ rawAnswers: { strengthRaw: "国家資格者による施術" } });
    const first = await handler.handlePostback(LINE_USER, "c=more&p=line_qa1&f=strengthRaw");
    expect(textOf(first)).toContain("あと1問");
    expect(textOf(first)).toContain("ここにして良かった"); // 強みの質問
  });
});

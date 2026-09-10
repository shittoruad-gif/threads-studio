import { describe, it, expect, vi } from "vitest";
import { buildMetaAiCallMessages, buildThreadsIntentUrl } from "./metaAiCallPrompt";

describe("Meta AI呼びかけ文のLINEカード", () => {
  it("絵つきカード＋短い一言の2通で、手順は2つだけ", () => {
    const msgs: any[] = buildMetaAiCallMessages({ username: "yokunaru4976seitai", storeName: "よくなる整体院", text: "@meta.ai 滑川市上小泉周辺の人に、うちのお店を届けて" }) as any[];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].type).toBe("flex");
    expect(msgs[0].contents.hero.url).toMatch(/^https:\/\//);
    const json = JSON.stringify(msgs[0]);
    expect(json).toContain("やることは2つだけ");
    expect(json).toContain("Threadsアプリで投稿する");
    expect(json).toContain(buildThreadsIntentUrl("@meta.ai 滑川市上小泉周辺の人に、うちのお店を届けて"));
    expect(msgs[1].text.length).toBeLessThan(400);
    expect(msgs[1].text).toContain("@yokunaru4976seitai（よくなる整体院）");
  });
  it("やり直しは、短い一言で理由と『消さなくて大丈夫』を添える", () => {
    const msgs: any[] = buildMetaAiCallMessages({ username: "a", storeName: null, text: "@meta.ai x", redo: true }) as any[];
    expect(msgs[1].text).toContain("消さなくて大丈夫");
  });
});

describe("複数アカウントは1束にまとめる", () => {
  it("3アカウントでもカード1通（カルーセル3枚）＋説明文1通", async () => {
    const { buildMetaAiCallBundle } = await import("./metaAiCallPrompt");
    const msgs: any[] = buildMetaAiCallBundle([
      { username: "a1", storeName: "店1", text: "@meta.ai x1" },
      { username: "a2", storeName: "店2", text: "@meta.ai x2" },
      { username: "a3", storeName: "店3", text: "@meta.ai x3" },
    ]) as any[];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].contents.type).toBe("carousel");
    expect(msgs[0].contents.contents).toHaveLength(3);
    expect(msgs[0].contents.contents[0].hero).toBeDefined();
    expect(msgs[1].text).toContain("カードは3枚");
  });
});

// ★案A（2026-09-10 三上様判断）：慣らし運転中のアカウントには呼びかけボタンを送らない。
//   呼びかけ投稿は「その日の1件」に数えられるため、慣らし中（1日1〜2件）に送ると
//   承認済みの自動投稿が押し出されて見送りになる（2026-09-09 比嘉様で発生）。
describe("慣らし運転中は呼びかけボタンを送らない（案A）", () => {
  const account = { id: 7, threadsUsername: "hisaisikkotsuin", defaultProjectId: null, isActive: 1 };
  const project = {
    id: "p1", storeName: "はいさい整骨院", businessType: "整骨院", area: "沖縄市",
    target: "肩こりの方", mainProblem: "肩こり", strength: "国家資格", localTerms: null, counselingResult: null,
  };

  async function loadWith(capped: boolean) {
    vi.resetModules();
    vi.doMock("./db", () => ({
      getUserById: async () => ({ id: 1, isDemoMode: false, metaAiAskEnabled: true }),
      getSubscriptionByUserId: async () => ({ planId: "pro", status: "active" }),
      getProjectsByUserId: async () => [project],
      getActiveThreadsAccounts: async () => [account],
      getAutoPostSettings: async () => ({ autoPostEnabled: true }),
      getThreadsAccountById: async () => ({ ...account, accessToken: "t", threadsUserId: "u", createdAt: new Date() }),
    }));
    vi.doMock("./accountRampCheck", () => ({
      rampForAccount: async () => ({ count: 1, capped, extra: false, days: 1, note: "", established: false, shortfall: 0 }),
    }));
    return await import("./metaAiCallPrompt");
  }

  it("慣らし中（capped）は1件も作らない", async () => {
    const m = await loadWith(true);
    expect(await m.buildTodayCallsForUser(1, 0)).toHaveLength(0);
  });

  it("慣らしを抜けたら今までどおり届く", async () => {
    const m = await loadWith(false);
    const calls = await m.buildTodayCallsForUser(1, 0);
    expect(calls).toHaveLength(1);
    expect(calls[0].username).toBe("hisaisikkotsuin");
    expect(calls[0].text).toContain("@meta.ai");
  });
});

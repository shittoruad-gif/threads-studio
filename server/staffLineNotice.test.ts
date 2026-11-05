import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 2026-11-04 三上様：自動で対応したお問い合わせの知らせは、三上様の「Threads Studio 公式LINE」
 * （role=admin の方の公式LINE。server/clientFollowup.ts の adminLineIds と同じ届け先）にだけ送り、メールは送らない。
 *   対象：設定で解決できるお問い合わせ（notifyStaffOfSettingRequest）・投稿の中身のご希望（notifyStaffOfContentRule）。
 *   ふつうのお問い合わせ（notifyStaffOfQuestion）は今まで通り（メール＋運営LINE）。
 */
const sent: Array<{ to: string; messages: any[] }> = [];
const emails: any[] = [];
const legacyLine: any[] = [];
vi.mock("./lineNotify", () => ({ pushMessages: vi.fn(async (to: string, messages: any[]) => { sent.push({ to, messages }); return true; }) }));
vi.mock("./_core/notification", () => ({
  sendEmail: vi.fn(async (p: any) => { emails.push(p); return true; }),
  notifyLine: vi.fn(async (t: string, c: string) => { legacyLine.push({ t, c }); return true; }),
}));
let admins: Array<{ id: number }> = [{ id: 1 }];
const lineIds: Record<number, string[]> = { 1: ["Uadmin1"], 2: ["Ucustomer"] };
vi.mock("./db", () => ({
  getDb: async () => ({ execute: async () => [admins] }),
  getLineUserIdsForUser: async (id: number) => lineIds[id] ?? [],
}));

const notify = await import("./supportNotify");

beforeEach(() => {
  sent.length = 0; emails.length = 0; legacyLine.length = 0; admins = [{ id: 1 }];
  process.env.SUPPORT_NOTIFY_EMAIL = "staff@example.com";
  delete process.env.QA_SAFE_MODE;
});

describe("自動で対応したお問い合わせの知らせは、三上様の公式LINEにだけ1通", () => {
  it("設定のお問い合わせ：adminのLINEへ1通・メールは送らない・運営LINE（LINE_ADMIN_TARGET_ID）にも送らない", async () => {
    const ok = await notify.notifyStaffOfSettingRequest({
      kind: "notice", outcome: "applied", questionId: 7, userName: "QA", userEmail: "qa@example.com",
      question: "投稿結果を送らないで欲しい", details: ["朝のまとめの「昨日の投稿結果」を止めました"], pressed: "止める",
      reply: "朝のまとめの「昨日の投稿結果」を止めました。",
    });
    expect(ok).toBe(true);
    expect(emails).toHaveLength(0);
    expect(legacyLine).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("Uadmin1");
    const text = sent[0].messages[0].text;
    expect(text.split("\n")[0]).toBe("【自動で対応しました】QA 様");
    expect(text).toContain("・お問い合わせ：投稿結果を送らないで欲しい");
    expect(text).toContain("（お客様が「止める」を押して確定）");
    expect(text).toContain("・お客様への返事：朝のまとめの「昨日の投稿結果」を止めました。");
    expect(text).toContain("/admin/questions?id=7");
  });

  it("投稿の中身のご希望も、メールをやめて同じLINEだけ", async () => {
    await notify.notifyStaffOfContentRule({ outcome: "declined", questionId: 8, userName: "QA", question: "スポーツ選手の話題はいらない", rules: ["スポーツ選手の話題は書かない"], pressed: "登録しない", reply: "承知しました。" });
    expect(emails).toHaveLength(0);
    expect(legacyLine).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].messages[0].text.split("\n")[0]).toBe("【お客様が見送りました】QA 様");
  });

  it("担当者が要るときも同じLINEへ（題を変えて）", async () => {
    await notify.notifyStaffOfSettingRequest({ kind: "topics", outcome: "needs_human", question: "https://example.com/ を元に投稿を", details: ["ページを読めませんでした"] });
    expect(emails).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].messages[0].text).toContain("【担当者の対応が要ります】");
  });

  it("お客様のLINEには送らない（adminの方だけ）・adminが2人なら各1通", async () => {
    admins = [{ id: 1 }, { id: 3 }];
    lineIds[3] = ["Uadmin3", "Uadmin1"];
    await notify.notifyStaffOfSettingRequest({ kind: "post_time", outcome: "applied", question: "自動は12時に", details: ["12:00に決めました"] });
    expect(sent.map((s) => s.to)).toEqual(["Uadmin1", "Uadmin3"]);
    expect(sent.some((s) => s.to === "Ucustomer")).toBe(false);
  });

  it("動作確認のとき（QA_SAFE_MODE）は送らない", async () => {
    process.env.QA_SAFE_MODE = "1";
    const ok = await notify.notifyStaffOfSettingRequest({ kind: "notice", outcome: "applied", question: "x", details: ["y"] });
    expect(ok).toBe(false);
    expect(sent).toHaveLength(0);
    delete process.env.QA_SAFE_MODE;
  });

  it("ふつうのお問い合わせ（自動で対応できなかったもの）は運営LINEだけ・メールは送らない（2026-11-05）", async () => {
    await notify.notifyStaffOfQuestion({ questionId: 9, userName: "QA", message: "ログインできません" });
    expect(emails).toHaveLength(0);
    expect(legacyLine).toHaveLength(1);
    expect(sent).toHaveLength(0);
  });

  it("運営LINEに届かなかったときだけ、取りこぼさないようメールで送る", async () => {
    const { notifyLine } = await import("./_core/notification");
    (notifyLine as any).mockImplementationOnce(async () => false);
    await notify.notifyStaffOfQuestion({ questionId: 10, userName: "QA", message: "ログインできません" });
    expect(emails).toHaveLength(1);
  });
});

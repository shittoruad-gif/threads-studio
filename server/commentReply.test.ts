import { describe, it, expect, vi } from "vitest";

// ★カードに出した文案が、そのまま保存されることを確かめる。
//   保存されないと「この文で送る」が別の文を送ってしまう（2026-09-19の不具合）。
const saved: Array<{ accountId: number; commentId: string; draft: string }> = [];
vi.mock("./db", () => ({
  saveCommentReplyDraft: async (accountId: number, commentId: string, draft: string) => {
    saved.push({ accountId, commentId, draft });
  },
}));

import { buildCommentReplyCards, buildReplyIntentUrl } from "./commentReply";
describe("コメント返信カード", () => {
  it("権限なし：Threadsアプリで返信するボタン（インテント）", async () => {
    const msgs: any[] = await buildCommentReplyCards([{ accountId: 1, accountUsername: "tenmei_seitai", hasReplyScope: false, commentId: "1", shortcode: "Dc7ZYeOHycy", commenter: "guest", commentText: "料金はいくらですか？", draft: "ご質問ありがとうございます。詳しくはDMでご案内しますね" }]) as any[];
    const json = JSON.stringify(msgs[0]);
    expect(json).toContain("Threadsアプリで返信する");
    expect(json).not.toContain("この文で送る");
    expect(json).toContain(buildReplyIntentUrl("Dc7ZYeOHycy", "ご質問ありがとうございます。詳しくはDMでご案内しますね"));
  });
  it("権限あり：この文で送る（API）も出す", async () => {
    const msgs: any[] = await buildCommentReplyCards([{ accountId: 1, accountUsername: "a", hasReplyScope: true, commentId: "9", shortcode: "x", commentText: "いいですね", draft: "ありがとうございます" }]) as any[];
    expect(JSON.stringify(msgs[0])).toContain("cr=send&a=1&c=9");
  });
});

describe("カードに出した文案の保存", () => {
  it("カードに出した文と、保存される文が同じ", async () => {
    saved.length = 0;
    const draft = "ご来店ありがとうございました。またお待ちしています";
    const msgs: any[] = await buildCommentReplyCards([{
      accountId: 7, accountUsername: "a", hasReplyScope: true, commentId: "555",
      shortcode: "sc", commentText: "楽しかったです", draft,
    }]) as any[];
    expect(JSON.stringify(msgs[0])).toContain(draft);
    expect(saved).toEqual([{ accountId: 7, commentId: "555", draft }]);
  });

  it("勧誘コメントは文案を保存しない（送るボタンも出ない）", async () => {
    saved.length = 0;
    await buildCommentReplyCards([{
      accountId: 7, accountUsername: "a", hasReplyScope: true, commentId: "556",
      shortcode: "sc", commentText: "稼げる副業あります DMください", draft: "", spam: true,
    }]);
    expect(saved).toEqual([]);
  });
});

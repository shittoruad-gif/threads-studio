import { describe, it, expect } from "vitest";
import { buildCommentReplyCards, buildReplyIntentUrl } from "./commentReply";
describe("コメント返信カード", () => {
  it("権限なし：Threadsアプリで返信するボタン（インテント）", () => {
    const msgs: any[] = buildCommentReplyCards([{ accountId: 1, accountUsername: "tenmei_seitai", hasReplyScope: false, commentId: "1", shortcode: "Dc7ZYeOHycy", commenter: "guest", commentText: "料金はいくらですか？", draft: "ご質問ありがとうございます。詳しくはDMでご案内しますね" }]) as any[];
    const json = JSON.stringify(msgs[0]);
    expect(json).toContain("Threadsアプリで返信する");
    expect(json).not.toContain("この文で送る");
    expect(json).toContain(buildReplyIntentUrl("Dc7ZYeOHycy", "ご質問ありがとうございます。詳しくはDMでご案内しますね"));
  });
  it("権限あり：この文で送る（API）も出す", () => {
    const msgs: any[] = buildCommentReplyCards([{ accountId: 1, accountUsername: "a", hasReplyScope: true, commentId: "9", shortcode: "x", commentText: "いいですね", draft: "ありがとうございます" }]) as any[];
    expect(JSON.stringify(msgs[0])).toContain("cr=send&a=1&c=9");
  });
});

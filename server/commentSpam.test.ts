import { describe, it, expect } from "vitest";
import { looksLikeSpamComment } from "../shared/commentSpam";
import { buildCommentReplyCards } from "./commentReply";

/**
 * 2026-09-17 ご質問 #37 梅原様
 * 「こちらのコメントは明らかな勧誘、出会い系的なコメントでしたので返信しませんでした。」
 * → カードに「返信しない」が無く、勧誘宛の文案が入っていたのが原因。
 */
describe("勧誘・出会い系のコメントを見分ける", () => {
  it("出会い系・アダルトの誘いは勧誘とみなす", () => {
    for (const t of [
      "今夜これから会いませんか？DMお待ちしてます",
      "近くにいるので今から会えませんか",
      "セフレ募集中です🥺",
      "裏垢やってます、見に来てください",
      "パパ活してくれる方いませんか",
      "LINE交換しませんか？",
    ]) expect(looksLikeSpamComment(t), t).toBe(true);
  });

  it("副業・投資の勧誘は勧誘とみなす", () => {
    for (const t of [
      "スマホだけで稼げる方法教えます！詳細はDMまで",
      "不労所得に興味ありませんか？",
      "月収50万を3ヶ月で達成しました。プロフ見てね",
      "バイナリーオプションの自動売買ツール配布中です",
      "プロフィール見てください、誰でもできる副業あります",
    ]) expect(looksLikeSpamComment(t), t).toBe(true);
  });

  it("相互フォローの誘いも、返信する値打ちがないので勧誘とみなす", () => {
    expect(looksLikeSpamComment("相互フォローお願いします！")).toBe(true);
    expect(looksLikeSpamComment("フォロバします🙇")).toBe(true);
  });

  it("名前そのものが出会い系のときも勧誘とみなす", () => {
    expect(looksLikeSpamComment("こんにちは😊", "deai_matching01")).toBe(true);
  });

  it("★本物のお客様のコメントを勧誘扱いしない", () => {
    for (const t of [
      "料金はいくらですか？",
      "はじめまして。腰痛がひどくて、予約できますか？",
      "DMしました、ご確認お願いします",
      "いつも参考にしています！ありがとうございます",
      "先日はありがとうございました。おかげで楽になりました",
      "駐車場はありますか",
      "子どもを連れて行っても大丈夫でしょうか",
      "投資の話ではないのですが、経営の相談にのっていただけますか",
      // ★お仕事のご挨拶を勧誘扱いしない（2026-09-19）
      "同じ倉敷で発信されている方なので、一度お会いしませんか",
      "セミナーでお会いしましたね。ありがとうございました",
    ]) expect(looksLikeSpamComment(t), t).toBe(false);
  });
});

describe("勧誘コメントのカード", () => {
  const item = {
    accountId: 1, accountUsername: "daigo_sekkotsu", hasReplyScope: true,
    commentId: "9", shortcode: "abc", commenter: "deai_bot",
    commentText: "今夜これから会いませんか？DMお待ちしてます", draft: "", spam: true,
  };

  it("文案も、返信のボタンも出さない", () => {
    const msgs: any[] = buildCommentReplyCards([item]) as any[];
    const s = JSON.stringify(msgs);
    expect(s).not.toContain("この文で送る");
    expect(s).not.toContain("Threadsアプリで返信する");
    expect(s).not.toContain("文案を作り直す");
    expect(s).toContain("勧誘・出会い系のコメントのようです");
  });

  it("「返信しない」が押せる", () => {
    const msgs: any[] = buildCommentReplyCards([item]) as any[];
    expect(JSON.stringify(msgs)).toContain("cr=ignore&a=1&c=9");
  });

  it("ふつうのコメントには、文案と一緒に「返信しない」も出す", () => {
    const msgs: any[] = buildCommentReplyCards([{
      accountId: 2, accountUsername: "a", hasReplyScope: false, commentId: "5",
      shortcode: "x", commentText: "料金はいくらですか？", draft: "ご質問ありがとうございます",
    }]) as any[];
    const s = JSON.stringify(msgs);
    expect(s).toContain("Threadsアプリで返信する");
    expect(s).toContain("cr=ignore&a=2&c=5");
    expect(s).not.toContain("勧誘・出会い系のコメントのようです");
  });

  it("勧誘だけのときは、説明文に「この文で送る」の案内を出さない", () => {
    const msgs: any[] = buildCommentReplyCards([item]) as any[];
    const note = String((msgs[1] as any).text);
    expect(note).toContain("勧誘・出会い系のようでしたので");
    expect(note).not.toContain("「この文で送る」で、その文のまま返信されます");
  });
});

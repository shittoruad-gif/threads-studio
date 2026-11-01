import { describe, it, expect } from "vitest";
import { postBodyFromMessage, pickPostTime, dayButtonLabel, postRequestBookedText } from "../shared/linePostRequest";

describe("公式LINEに送られた文章から投稿の本文を取り出す（2026-11-01）", () => {
  it("1行目が「投稿してください」なら、残りが本文", () => {
    const t = "こちら投稿お願いします\n来週の水曜19時から、駅前のお店で交流会を開きます。\n初めての方も大歓迎です。";
    expect(postBodyFromMessage(t)).toBe("来週の水曜19時から、駅前のお店で交流会を開きます。\n初めての方も大歓迎です。");
  });
  it("最後の行が「投稿してください」でも、残りが本文", () => {
    const t = "来週の水曜19時から、駅前のお店で交流会を開きます。\n初めての方も大歓迎です。\nこれを投稿してください";
    expect(postBodyFromMessage(t)).toBe("来週の水曜19時から、駅前のお店で交流会を開きます。\n初めての方も大歓迎です。");
  });
  it("依頼の行に「。」が入っていても取り出す", () => {
    const t = "こちら投稿したい内容です。お願いします\n11月の交流会は駅前で19時からです💫\nお申し込みはプロフィールから";
    expect(postBodyFromMessage(t)).toBe("11月の交流会は駅前で19時からです💫\nお申し込みはプロフィールから");
  });
  it("投稿文をそのまま貼ったものは全文が本文", () => {
    const t = "サンプル交流会のお知らせ💫\n\n毎月第3水曜の夜に、駅前で開いています。\n名刺交換だけで終わらない会です。\n\n#岡山 #交流会";
    expect(postBodyFromMessage(t)).toBe(t);
  });
  it("ご質問は本文にしない", () => {
    expect(postBodyFromMessage("投稿はいつ出ますか？")).toBeNull();
    expect(postBodyFromMessage("ログインできません")).toBeNull();
    expect(postBodyFromMessage("投稿してください")).toBeNull();
  });
});

describe("空いている時刻を選ぶ", () => {
  const now = Date.parse("2026-11-01T22:00:00+09:00");
  it("先の日は昼12時から", () => {
    expect(pickPostTime({ dayJst: "2026-11-03", now, existing: [] })?.toISOString()).toBe("2026-11-03T03:00:00.000Z");
  });
  it("ほかの投稿と90分あける", () => {
    const existing = [Date.parse("2026-11-03T12:30:00+09:00")];
    expect(pickPostTime({ dayJst: "2026-11-03", now, existing })?.toISOString()).toBe("2026-11-03T09:00:00.000Z"); // 18時
  });
  it("今日の残りに時間が無ければ null", () => {
    expect(pickPostTime({ dayJst: "2026-11-01", now, existing: [] })).toBeNull();
  });
  it("表示", () => {
    expect(dayButtonLabel("2026-11-03")).toBe("11/3（火）");
    expect(postRequestBookedText(new Date("2026-11-03T03:00:00Z"))).toContain("11/3（火） 12:00 に");
  });
});

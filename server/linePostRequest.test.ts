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

describe("日時の行と区切り線のあるご依頼（2026-11-02）", () => {
  const now = Date.parse("2026-11-02T05:00:00+09:00");
  it("「明日3日の18時頃／この投稿をお願いします／線／本文」", async () => {
    const { parsePostRequest } = await import("../shared/linePostRequest");
    const r = parsePostRequest("明日３日の18時頃\nこの投稿をお願いします\n\n————————\n\n経営者の皆さんへ質問です\n\n初めての交流会で一番気になることは？", now);
    expect(r?.body).toBe("経営者の皆さんへ質問です\n\n初めての交流会で一番気になることは？");
    expect(r?.asked).toBe(true);
    expect(r?.want).toEqual({ day: "2026-11-03", hour: 18, minute: 0 });
  });
  it("日だけの数字は、過ぎていれば来月", async () => {
    const { parseWhen } = await import("../shared/linePostRequest");
    expect(parseWhen("8日の18時頃", now)?.day).toBe("2026-11-08");
    expect(parseWhen("1日の夜7時", now)).toEqual({ day: "2026-12-01", hour: 19, minute: 0 });
    expect(parseWhen("今日のお昼", now)).toEqual({ day: "2026-11-02", hour: 12, minute: 0 });
    expect(parseWhen("11/15 9:30", now)).toEqual({ day: "2026-11-15", hour: 9, minute: 30 });
  });
  it("ご依頼の行が無い貼り付けは asked=false", async () => {
    const { parsePostRequest } = await import("../shared/linePostRequest");
    const t = "サンプル交流会のお知らせ💫\n\n毎月第3水曜の夜に、駅前で開いています。\n名刺交換だけで終わらない会です。\n\n#岡山 #交流会";
    expect(parsePostRequest(t, now)).toEqual({ body: t, asked: false });
  });
});

describe("「配信お願いします」も依頼として読む（2026-11-02）", () => {
  it("明日の12時頃配信お願いします", async () => {
    const { parsePostRequest } = await import("../shared/linePostRequest");
    const r = parsePostRequest("明日の12時頃配信お願いします\n\n——————\n\nこんにちは\n\n来週の交流会の準備を進めています。\n———\n奇数月の第3水曜\n———\nの固定で開きます", Date.parse("2026-11-02T09:30:00+09:00"));
    expect(r?.asked).toBe(true);
    expect(r?.want).toEqual({ day: "2026-11-03", hour: 12, minute: 0 });
    expect(r?.body.startsWith("こんにちは")).toBe(true);
    expect(r?.body).toContain("———\n奇数月の第3水曜\n———");
  });
});

import { describe, it, expect } from "vitest";
import { approvalLeadText, capLine, deferredNoticeText, jstMonthDayLabel, jstTimeLabel } from "../shared/approvalLead";

describe("承認カードの頭の文（設定どおりに書く・2026-11-01）", () => {
  it("OKした分だけ公開の方には「押さなくても公開」と書かない", () => {
    const t = approvalLeadText({ label: "明日", dateLabel: "11月2日", count: 1, softPublish: false });
    expect(t).toContain("明日（11月2日）の投稿が1件できました。");
    expect(t).toContain("押した投稿だけが、明日の予定の時間に出ます。");
    expect(t).toContain("今夜のうちでも、明日になってからでも押せます。");
    expect(t).toContain("押さなかった投稿は出ません。");
    expect(t).not.toContain("そのまま公開");
  });

  it("見送りしなければ公開の方は、今までどおり", () => {
    const t = approvalLeadText({ label: "今日", dateLabel: "11月1日", count: 2, softPublish: true });
    expect(t).toContain("今日の投稿が2件できました。");
    expect(t).toContain("「見送る」を押さない限り、予定時刻にそのまま公開されます。");
  });

  it("数を抑えている間は、直接の投稿も数に入ることを添える", () => {
    const capNote = capLine({ reason: "ramp", cap: 1 });
    const t = approvalLeadText({ label: "明日", dateLabel: "11月2日", count: 1, softPublish: false, capNote });
    expect(t).toContain("いまは1日1件までにしています。");
    expect(t).toContain("Threadsのアプリから直接投稿した分も、この数に入ります。");
    expect(capLine({ reason: "cooldown", cap: 1, untilLabel: "11月8日" })).toContain("11月8日まで1日1件");
  });
});

describe("明日に回したお知らせ", () => {
  const from = new Date("2026-11-01T12:13:00Z"); // 21:13 JST
  const to = new Date("2026-11-02T12:13:00Z");
  it("直接の投稿があった日は、その数と、このLINEに文章を送るよう書く", () => {
    const t = deferredNoticeText({ username: "sample_shop", reason: "ramp", cap: 1, todayCount: 3, direct: 3, moved: [{ head: "ラジオで毎月お話ししています", from, to }] });
    expect(t).toContain("今日はThreadsのアプリから直接の投稿が3件ありました。");
    expect(t).toContain("消えたわけではありません。");
    expect(t).toContain("今日 21:13 → 11月2日 21:13");
    expect(t).toContain("このLINEに文章を送ってください");
  });
  it("こちらの投稿だけで届いた日は、直接の投稿の話をしない", () => {
    const t = deferredNoticeText({ username: "sample_shop", reason: "ramp", cap: 1, todayCount: 1, direct: 0, moved: [{ head: "テスト", from, to }] });
    expect(t).toContain("今日はすでに1件の投稿が出ています。");
    expect(t).not.toContain("直接の投稿が");
  });
  it("日付と時刻はJSTで書く", () => {
    expect(jstMonthDayLabel(from)).toBe("11月1日");
    expect(jstTimeLabel(from)).toBe("21:13");
  });
});

describe("慣らし・冷却の日程を添える（2026-11-01）", () => {
  const createdAt = "2026-10-29T18:30:00Z"; // 10/30 3:30 JST に連携
  it("この先の段階を日付つきで出す", () => {
    const t = capLine({ reason: "ramp", cap: 1, createdAt, contract: 3, now: Date.parse("2026-11-01T22:00:00+09:00") });
    expect(t).toContain("・11/3（火）ごろまで：1日1件");
    expect(t).toContain("・11/4（水）ごろから：1日2件");
    expect(t).toContain("・11/9（月）ごろから：1日3件（減った分を補うため、しばらく1日4件）");
    expect(t).toContain("Threadsのアプリから直接投稿した分も、この数に入ります。");
  });
  it("過ぎた段階は出さない", () => {
    const t = capLine({ reason: "ramp", cap: 2, createdAt, contract: 3, now: Date.parse("2026-11-05T12:00:00+09:00") });
    expect(t).not.toContain("1日1件");
    expect(t).toContain("・11/8（日）ごろまで：1日2件");
  });
  it("冷却は明ける日と戻る本数", () => {
    const t = capLine({ reason: "cooldown", cap: 1, untilLabel: "11月8日", untilJst: "2026-11-08", contract: 3 });
    expect(t).toContain("11月8日まで1日1件");
    expect(t).toContain("11/9（月）からは1日3件に戻ります。");
  });
});

describe("確認を待っている投稿が無いとき（2026-11-02）", () => {
  it("出る予定の中身と確認済みかを見せる", async () => {
    const { noWaitingText } = await import("../shared/approvalLead");
    const t = noWaitingText({ upcoming: [{ at: "2026-11-02T12:13:00Z", text: "ラジオでお話ししています\n毎月第4水曜", confirmed: true }], reviewHour: 21 });
    expect(t).toContain("・11/2（月） 21:13「ラジオでお話ししています 毎月第4水曜…」（確認済み）");
    expect(t).toContain("もう一度押す必要はありません");
    expect(t).toContain("前の日の夜9時ごろ");
  });
  it("予定が無ければ短く", async () => {
    const { noWaitingText } = await import("../shared/approvalLead");
    expect(noWaitingText({ upcoming: [], reviewHour: null })).toBe("いま確認をお待ちしている投稿はありません。\n\n新しい投稿ができたら、このトークでお知らせします。");
  });
});

import { describe, it, expect } from "vitest";
import {
  detectNoticeRequest,
  detectTopicUrlRequest,
  detectPostTimeRequest,
  filterTopics,
  headingsFromHtml,
  healthTopicVerdict,
  cleanHeading,
  timeTokens,
  dayIn,
  encodeJst,
  decodeJst,
  noticeConfirmText,
  noticeKeysFromCodes,
  noticeCodes,
  parseTopicsFromConfirm,
  topicsConfirmText,
  UNSTOPPABLE_NOTE,
} from "../shared/settingRequest";
import { detectContentRequest } from "../shared/contentRequest";
import { staffLineNoticeText } from "./supportNotify";

/**
 * 2026-11-04 三上様「今後、このような問い合わせが来たら、自動的に対応するように変更してください」。
 * 公式LINEに届く「設定で解決できるお問い合わせ」の見分け（shared/settingRequest.ts）。
 * 例の文は一般化してある（お客様の名前・URL・アカウントは書かない）。
 */
const NOW = Date.parse("2026-11-04T10:00:00+09:00"); // 水曜

describe("1. 通知を止めたい／戻したい：当たる文", () => {
  const cases: Array<[string, "off" | "on", string[]]> = [
    ["投稿結果を送らないで欲しい", "off", ["daily_result"]],
    ["昨日の結果のお知らせはいらないです", "off", ["daily_result"]],
    ["朝のお知らせはいらない", "off", ["daily_result", "next_action"]],
    ["次にやることの案内はいらない", "off", ["next_action"]],
    ["交流の案内はいらない", "off", ["engagement"]],
    ["毎日の交流のLINEは止めてください", "off", ["engagement"]],
    ["Meta AIの呼びかけ投稿はやめたい", "off", ["meta_ai"]],
    ["読み物は不要です", "off", ["newsletter"]],
    ["ご案内のメールは送らなくて大丈夫です", "off", ["email"]],
    ["投稿結果をまた送ってほしい", "on", ["daily_result"]],
    ["交流の案内を再開してください", "on", ["engagement"]],
    ["朝のまとめをまた受け取りたい", "on", ["daily_result", "next_action"]],
    ["投稿結果は送ってほしくないです", "off", ["daily_result"]],
  ];
  for (const [t, action, keys] of cases) {
    it(t, () => {
      const r = detectNoticeRequest(t);
      expect(r).not.toBeNull();
      expect(r!.action).toBe(action);
      expect(r!.keys).toEqual(keys);
    });
  }
  it("どの通知か書いていない「通知はいらない」は、一覧から選んでいただく（keys が空）", () => {
    expect(detectNoticeRequest("LINEの通知はいらない")).toEqual({ action: "off", keys: [], unstoppable: false });
  });
  it("承認カードは止められない連絡として見分ける", () => {
    expect(detectNoticeRequest("承認カードはいらない")).toEqual({ action: "off", keys: [], unstoppable: true });
  });
});

describe("1. 通知：当たらない文（横取りしない）", () => {
  const misses = [
    "投稿結果が届かない",
    "昨日の投稿結果が来なくなりました",
    "自動投稿を止めてください",
    "投稿を一時停止したい",
    "通知はどこで止められますか",
    "Meta AIの返信を非表示にしたい",
    "スポーツ選手の話題はいらない",
    "絵文字を減らしてほしい",
    "交流のやり方を教えてください",
    "メールが届きません",
    "いつもありがとうございます",
    "投稿結果はどこで見られますか？",
  ];
  for (const t of misses) it(t, () => expect(detectNoticeRequest(t)).toBeNull());
  it("通知のご希望は、投稿の中身のご希望（書き方の決まり）にも当たらない", () => {
    for (const t of ["投稿結果を送らないで欲しい", "朝のお知らせはいらない", "交流の案内はいらない", "次にやることの案内はいらない"]) {
      expect(detectContentRequest(t)).toBeNull();
    }
  });
});

describe("1. 通知：確認の文", () => {
  it("止めるもの・届き続けるもの・止められない連絡・戻し方を書く", () => {
    const t = noticeConfirmText({ action: "off", keys: ["daily_result"] });
    expect(t).toContain("朝のまとめの「昨日の投稿結果」を止めます。よろしいですか。");
    expect(t).toContain("朝のまとめのほかの中身（お知らせ・承認待ちの件数）は届きます。");
    expect(t).toContain(UNSTOPPABLE_NOTE);
    expect(t).toContain("「設定」→「お知らせの受け取り」で戻せます");
    expect(t).not.toMatch(/AI|ＡＩ/);
  });
  it("ボタンの短い名前は行って戻ってこられる", () => {
    expect(noticeKeysFromCodes(noticeCodes(["daily_result", "engagement"]))).toEqual(["daily_result", "engagement"]);
    expect(noticeKeysFromCodes("xx.dr")).toEqual(["daily_result"]);
  });
});

describe("2. ホームページのURL＋「これを元に投稿を」：当たる文", () => {
  const hits = [
    "https://example.com/trouble/\n\nこのHPの内容を元に記事を作成できないでしょうか？",
    "https://example.com/menu このページを参考に投稿を作ってください",
    "このページの内容で投稿してほしいです https://example.com/a",
    "https://example.com/blog/1 を元にネタを作ってほしい",
    "https://example.com/news こちらから話題を拾って投稿にしてください",
    "ホームページ https://example.com/ を読んで投稿を書いてほしい",
    "https://example.com/x の内容を投稿に使ってください",
    "https://example.com/y\nこれをもとに発信してほしい",
  ];
  for (const t of hits) it(t.replace(/\n/g, " "), () => expect(detectTopicUrlRequest(t)?.url).toMatch(/^https:\/\/example\.com/));
});

describe("2. URL：当たらない文", () => {
  const misses = [
    "https://example.com/",
    "https://lin.ee/abc",
    "https://example.com/ をご案内先に登録してください",
    "https://example.com/ を固定投稿のリンクにしてほしい",
    "https://example.com/ が開けません",
    "このページを元に投稿を作ってください",
    "https://a.example.com/ と https://b.example.com/ を元に投稿を作って",
    "https://example.com/ ありがとうございます",
    "https://example.com/ 公式LINEのURLです",
  ];
  for (const t of misses) it(t, () => expect(detectTopicUrlRequest(t)).toBeNull());
});

describe("2. ページの見出しから話題を拾う", () => {
  const html = `<html><head><title>症状別のご案内｜例の整体院</title></head><body>
    <nav><h2>ホーム</h2><h2>アクセス</h2></nav>
    <h1>症状別のご案内</h1>
    <h2>01. 肩こりと姿勢のくせ</h2>
    <h2>腰痛でお悩みの方へ</h2>
    <h3>心の不調とからだの関係</h3>
    <h3>ヘルニアを根本から治す施術</h3>
    <h3>薬に頼らない毎日へ</h3>
    <h2>料金</h2>
    <h2>産後の骨盤まわり</h2>
    <h2>デスクワークの首こり</h2>
    <h2>肩こりと姿勢のくせ</h2>
    <h2>猫背と呼吸</h2>
    <footer><h2>お問い合わせ</h2></footer>
  </body></html>`;
  it("ナビ・料金・お問い合わせは外し、重複は1つにし、ページの順に最大5件", () => {
    const r = filterTopics(headingsFromHtml(html), { health: true });
    expect(r.topics).toEqual(["症状別のご案内", "肩こりと姿勢のくせ", "腰痛でお悩みの方へ", "産後の骨盤まわり", "デスクワークの首こり"]);
  });
  it("健康・医療系のお店では、心の病気・病名の治療・薬をやめる勧めの話題を外す", () => {
    const r = filterTopics(headingsFromHtml(html), { health: true });
    expect(r.dropped).toEqual(["心の不調とからだの関係", "ヘルニアを根本から治す施術", "薬に頼らない毎日へ"]);
  });
  it("健康系でないお店では外さない", () => {
    const r = filterTopics(headingsFromHtml(html), { health: false });
    expect(r.dropped).toEqual([]);
    expect(r.topics).toContain("心の不調とからだの関係");
  });
  it("すでにネタ帳にある話題は外す", () => {
    const r = filterTopics(["肩こりと姿勢のくせ", "猫背と呼吸"], { health: true, existing: ["肩こりと 姿勢のくせ"] });
    expect(r.topics).toEqual(["猫背と呼吸"]);
    expect(r.duplicate).toEqual(["肩こりと姿勢のくせ"]);
  });
  it("見出しの判定", () => {
    expect(cleanHeading("■ 産後の骨盤ケア")).toBe("産後の骨盤ケア");
    expect(cleanHeading("ご予約はこちら")).toBeNull();
    expect(cleanHeading("Copyright 2026")).toBeNull();
    expect(cleanHeading("ab")).toBeNull();
    expect(healthTopicVerdict("うつ症状と整体").ok).toBe(false);
    expect(healthTopicVerdict("手術をしなくて済む方法").ok).toBe(false);
    expect(healthTopicVerdict("必ず楽になる施術").ok).toBe(false);
    expect(healthTopicVerdict("肩こりと姿勢").ok).toBe(true);
  });
  it("確認の文から話題を読み戻せる", () => {
    const t = topicsConfirmText({ topics: ["肩こりと姿勢", "猫背と呼吸"], dropped: ["心の不調"] });
    expect(t).toContain("次の2件をネタ帳に登録します。よろしいですか。");
    expect(t).toContain("健康の広告の決まりに触れやすい話題（1件）は外しました。");
    expect(parseTopicsFromConfirm(t)).toEqual(["肩こりと姿勢", "猫背と呼吸"]);
  });
});

describe("3. 自動投稿の時刻：当たる文", () => {
  it("「自動は12時に」→ これからの時刻（fixedPostHours）", () => {
    expect(detectPostTimeRequest("自動は12時にしてほしい", NOW)).toEqual({ kind: "fixed", hours: [12] });
  });
  it("「自動は12時に。3回になったら12時と15時」→ 12,15", () => {
    expect(detectPostTimeRequest("自動は12時に。3回になったら12時と15時", NOW)).toEqual({ kind: "fixed", hours: [12, 15] });
  });
  it("「いつも12時と15時に投稿してほしい」", () => {
    expect(detectPostTimeRequest("いつも12時と15時に投稿してほしい", NOW)).toEqual({ kind: "fixed", hours: [12, 15] });
  });
  it("「毎日の投稿は午後3時にお願いします」", () => {
    expect(detectPostTimeRequest("毎日の投稿は午後3時にお願いします", NOW)).toEqual({ kind: "fixed", hours: [15] });
  });
  it("「投稿時間を18時に固定してください」", () => {
    expect(detectPostTimeRequest("投稿時間を18時に固定してください", NOW)).toEqual({ kind: "fixed", hours: [18] });
  });
  it("「５日(木)12:00にお願いします」（本文なし・日時だけ）→ その日の予約を動かす", () => {
    expect(detectPostTimeRequest("５日(木)12:00にお願いします", NOW)).toEqual({ kind: "move", day: "2026-11-05", to: { hour: 12, minute: 0 }, bare: true });
  });
  it("「15:00で予約になっているものを12:00に」→ 15時の予約を12時に", () => {
    expect(detectPostTimeRequest("15:00で予約になっているものを12:00にしてください", NOW)).toEqual({ kind: "move", from: { hour: 15, minute: 0 }, day: undefined, to: { hour: 12, minute: 0 }, bare: false });
  });
  it("「15時の予約を12時に変えて」", () => {
    expect(detectPostTimeRequest("15時の予約を12時に変えて", NOW)).toMatchObject({ kind: "move", from: { hour: 15 }, to: { hour: 12, minute: 0 } });
  });
  it("「明日の投稿を12時半にして」", () => {
    expect(detectPostTimeRequest("明日の投稿を12時半にして", NOW)).toEqual({ kind: "move", day: "2026-11-05", to: { hour: 12, minute: 30 }, bare: false });
  });
  it("「11/6の21時の投稿を18時にずらしてもらえますか」", () => {
    expect(detectPostTimeRequest("11/6の21時の投稿を18時にずらしてもらえますか", NOW)).toMatchObject({ kind: "move", from: { hour: 21 }, day: "2026-11-06", to: { hour: 18 } });
  });
  it("「投稿は12時にしてほしい」→ ずっとか次の1本だけか、両方のボタン", () => {
    expect(detectPostTimeRequest("投稿は12時にしてほしい", NOW)).toEqual({ kind: "either", to: { hour: 12, minute: 0 } });
  });
});

describe("3. 時刻：当たらない文", () => {
  const misses = [
    "何時に投稿されますか？",
    "投稿の時間はいつですか",
    "明日は12時から営業します",
    "Zoomは5日の12時でお願いします",
    "2時間後に投稿して",
    "12時から15時の間でお願いします",
    "案を見る時間を12時にしたい",
    "投稿が15時にずれてしまいました",
    "15時に投稿されませんでした",
    "明日の投稿をお願いします",
    "ありがとうございます",
    "10時の呼びかけを12時にして",
    // 本文つきのご依頼は送られた文章の予約（parsePostRequest）が先に取る
    "明日の12時にこの投稿をお願いします\n今月の営業日のお知らせです。11日は臨時でお休みをいただきます。",
    "自動は12時半にしてほしい",
  ];
  for (const t of misses) it(t.replace(/\n/g, " "), () => expect(detectPostTimeRequest(t, NOW)).toBeNull());
});

describe("3. 時刻と日付の読み取り", () => {
  it("時刻", () => {
    expect(timeTokens("12時と15時").map((x) => x.hour)).toEqual([12, 15]);
    expect(timeTokens("午後3時").map((x) => x.hour)).toEqual([15]);
    expect(timeTokens("夜9時半").map((x) => [x.hour, x.minute])).toEqual([[21, 30]]);
    expect(timeTokens("１２：００").map((x) => x.hour)).toEqual([12]);
    expect(timeTokens("2時間後")).toEqual([]);
    expect(timeTokens("25時")).toEqual([]);
  });
  it("日付（過ぎた日は来月・1日2回は日付ではない）", () => {
    expect(dayIn("5日", NOW)).toBe("2026-11-05");
    expect(dayIn("3日", NOW)).toBe("2026-12-03");
    expect(dayIn("明日", NOW)).toBe("2026-11-05");
    expect(dayIn("11/10", NOW)).toBe("2026-11-10");
    expect(dayIn("1日2回", NOW)).toBeUndefined();
    expect(dayIn("毎日", NOW)).toBeUndefined();
  });
  it("ボタンの時刻は行って戻ってこられる（JST）", () => {
    const at = new Date(Date.parse("2026-11-05T12:00:00+09:00"));
    expect(encodeJst(at)).toBe("202611051200");
    expect(decodeJst("202611051200")!.getTime()).toBe(at.getTime());
    expect(decodeJst("bad")).toBeNull();
  });
});

describe("三上様の公式LINEへの1通の本文", () => {
  it("「このようなお問い合わせが来たため、このように対応しました」が一目で分かる", () => {
    const t = staffLineNoticeText({
      outcome: "applied", name: "QA", question: "投稿結果を送らないで欲しい",
      action: "朝のまとめの「昨日の投稿結果」を止めました", pressed: "止める",
      reply: "朝のまとめの「昨日の投稿結果」を止めました。", link: "https://example.com/admin/questions?id=7",
    });
    expect(t.split("\n")[0]).toBe("【自動で対応しました】QA 様");
    expect(t).toContain("・お問い合わせ：投稿結果を送らないで欲しい");
    expect(t).toContain("・対応：朝のまとめの「昨日の投稿結果」を止めました（お客様が「止める」を押して確定）");
    expect(t).toContain("・お客様への返事：朝のまとめの「昨日の投稿結果」を止めました。");
    expect(t).toContain("（対応は不要です。戻すときは管理画面 https://example.com/admin/questions?id=7）");
  });
  it("見送り・担当者が要るときは題を変える", () => {
    const base = { name: "QA", question: "x", action: "y", link: "L" };
    expect(staffLineNoticeText({ ...base, outcome: "declined" }).split("\n")[0]).toBe("【お客様が見送りました】QA 様");
    expect(staffLineNoticeText({ ...base, outcome: "needs_human" }).split("\n")[0]).toBe("【担当者の対応が要ります】QA 様");
    expect(staffLineNoticeText({ ...base, outcome: "needs_human" })).toContain("内容を確かめてご対応ください");
    expect(staffLineNoticeText({ ...base, outcome: "info" }).split("\n")[0]).toBe("【ご案内だけお返ししました】QA 様");
  });
});

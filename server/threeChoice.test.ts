/**
 * 3案からお選びいただく形の番人（2026-09-22 三上様指示）。
 *
 * ★この仕組みで怖いのは「3案が3件とも公開される」こと（9/12 の追い投稿事故と同じ筋）。
 *   申し送り（docs/night-todo.md）に挙がっていた6点を、ここで1つずつ固定する。
 *     1. 先頭の文面を差し替える
 *     2. 「すべて承認する」を出さない
 *     3. ボタンは「この案にする」
 *     4. 押されなければ1件も公開しない
 *     5. 1案が選ばれたら残りを即 canceled
 *     6. 1日の本数では3案を1件として数える
 */
import { describe, it, expect, vi } from "vitest";
import {
  shouldOfferChoices,
  newChoiceGroupId,
  isChoicePost,
  CHOICE_ANGLE_IDS,
  CHOICE_COUNT,
  CHOICE_LEAD_TEXT,
  choiceChosenText,
  type DayOutcome,
} from "@shared/threeChoice";
import { buildPostCards } from "./lineChat";
import { getAngle } from "@shared/postAngles";

const day = (date: string, created: number, published: number): DayOutcome => ({ date, created, published });

describe("発動の判定", () => {
  it("2日続けて「作られたのに公開ゼロ」なら3案にする（香取様 acc21 の実データ）", () => {
    // 9/21 作1・公開0／9/22 作4・公開0（本番のDBで実測した値）
    expect(shouldOfferChoices([day("2026-09-21", 1, 0), day("2026-09-22", 4, 0)])).toBe(true);
  });

  it("1日でも公開できていれば発動しない", () => {
    expect(shouldOfferChoices([day("2026-09-21", 1, 1), day("2026-09-22", 4, 0)])).toBe(false);
    expect(shouldOfferChoices([day("2026-09-21", 1, 0), day("2026-09-22", 4, 1)])).toBe(false);
  });

  it("投稿が1本も作られなかった日は対象にしない（材料不足はお詫びの仕組みの担当）", () => {
    expect(shouldOfferChoices([day("2026-09-21", 0, 0), day("2026-09-22", 0, 0)])).toBe(false);
    expect(shouldOfferChoices([day("2026-09-21", 0, 0), day("2026-09-22", 3, 0)])).toBe(false);
  });

  it("1日ぶんしか実績が無ければ発動しない", () => {
    expect(shouldOfferChoices([day("2026-09-22", 3, 0)])).toBe(false);
    expect(shouldOfferChoices([])).toBe(false);
  });

  it("日付の並び順が入れ替わっていても、新しい2日で判定する", () => {
    const rows = [day("2026-09-20", 1, 1), day("2026-09-22", 4, 0), day("2026-09-21", 1, 0)];
    expect(shouldOfferChoices(rows)).toBe(true);
  });

  it("古い日に公開ゼロが続いていても、直近で公開できていれば発動しない", () => {
    const rows = [day("2026-09-19", 1, 0), day("2026-09-20", 1, 0), day("2026-09-21", 1, 0), day("2026-09-22", 1, 2)];
    expect(shouldOfferChoices(rows)).toBe(false);
  });
});

describe("3案の切り口", () => {
  it("案の数だけ切り口が用意してある", () => {
    expect(CHOICE_ANGLE_IDS.length).toBe(CHOICE_COUNT);
    expect(new Set(CHOICE_ANGLE_IDS).size).toBe(CHOICE_COUNT);
  });

  it("どれも実在する切り口である（綴り間違いで指定が無視されない）", () => {
    for (const id of CHOICE_ANGLE_IDS) expect(getAngle(id), id).toBeTruthy();
  });

  it("健康系のお店で外される切り口（結果を語る型）を含まない", () => {
    // 含んでいると健康系のお店で2案に減ってしまう
    for (const id of CHOICE_ANGLE_IDS) expect(["change_story", "customer_voice"]).not.toContain(id);
  });
});

describe("印（choiceGroupId）", () => {
  it("枠ごとに違う印ができ、列の長さ（40）に収まる", () => {
    const a = newChoiceGroupId(21, "2026-09-23", () => 0.123456);
    const b = newChoiceGroupId(21, "2026-09-23", () => 0.987654);
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(40);
  });

  it("印の有無で選択肢かどうかを見分ける", () => {
    expect(isChoicePost({ choiceGroupId: "ch-21-20260923-x" })).toBe(true);
    expect(isChoicePost({ choiceGroupId: null })).toBe(false);
    expect(isChoicePost(null)).toBe(false);
  });
});

describe("承認カード（3案のとき）", () => {
  const g = "ch-21-20260923-abc";
  const choicePosts = [
    { id: 1, postContent: "案その1", scheduledAt: new Date(), choiceGroupId: g },
    { id: 2, postContent: "案その2", scheduledAt: new Date(), choiceGroupId: g },
    { id: 3, postContent: "案その3", scheduledAt: new Date(), choiceGroupId: g },
  ];

  it("ボタンは「この案にする」（＝選択だと分かる表記）", () => {
    const s = JSON.stringify(buildPostCards(choicePosts, { bulk: true }));
    expect(s).toContain("この案にする");
    expect(s).not.toContain("これで投稿する");
  });

  it("「すべて承認する」を出さない（押されると3件とも公開される）", () => {
    const s = JSON.stringify(buildPostCards(choicePosts, { bulk: true }));
    expect(s).not.toContain("すべて承認する");
  });

  it("「公開予定」と書かない（3件とも公開されると読めてはいけない）", () => {
    const s = JSON.stringify(buildPostCards(choicePosts, { bulk: true }));
    expect(s).not.toContain("公開予定");
    expect(s).toContain("1つ目の案（全3案）");
    expect(s).toContain("3つ目の案（全3案）");
  });

  it("見送るボタンは今までどおり残す", () => {
    const s = JSON.stringify(buildPostCards(choicePosts, { bulk: true }));
    expect(s).toContain("見送る");
  });

  it("通常の投稿は今までどおり（この変更で壊れていない）", () => {
    const s = JSON.stringify(buildPostCards(
      [{ id: 9, postContent: "ふつうの投稿", scheduledAt: new Date() },
       { id: 10, postContent: "ふつうの投稿2", scheduledAt: new Date() }],
      { bulk: true },
    ));
    expect(s).toContain("これで投稿する");
    expect(s).toContain("すべて承認する（2件）");
    expect(s).toContain("公開予定");
  });

  it("一覧で3案と通常が混ざっても、ラベルを取り違えず「すべて承認する」も出さない", () => {
    const mixed = [
      ...choicePosts,
      { id: 11, postContent: "ふつうの投稿", scheduledAt: new Date(), choiceGroupId: null },
    ];
    const s = JSON.stringify(buildPostCards(mixed, { bulk: true }));
    expect(s).toContain("この案にする");   // 3案のカード
    expect(s).toContain("これで投稿する"); // 通常のカード
    expect(s).not.toContain("すべて承認する");
  });

  it("選択肢が1件しか残っていなければ、通常の投稿として扱う", () => {
    const s = JSON.stringify(buildPostCards(
      [{ id: 1, postContent: "残り1件", scheduledAt: new Date(), choiceGroupId: g }],
      { bulk: true },
    ));
    expect(s).toContain("これで投稿する");
    expect(s).not.toContain("この案にする");
  });
});

describe("お客様にお送りする文面", () => {
  it("お詫びを入れない（自動応答の体裁・三上様のご指示）", () => {
    expect(CHOICE_LEAD_TEXT).not.toMatch(/申し訳|お詫び|すみません/);
  });

  it("「選ばれた1件だけ公開する」と必ず書いてある", () => {
    expect(CHOICE_LEAD_TEXT).toContain("1案だけを公開");
    expect(CHOICE_LEAD_TEXT).toContain("見送る");
  });

  it("選んだあとのお返事に、残りが公開されないことを書く", () => {
    expect(choiceChosenText(2)).toContain("2件は公開しません");
    expect(choiceChosenText(0)).not.toContain("公開しません");
  });

  it("絵文字を使わない", () => {
    expect(CHOICE_LEAD_TEXT).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe("承認依頼メール（3案のとき）", () => {
  const g = "ch-21-20260923-abc";
  const sent: any[] = [];

  it("「3件の投稿」と書かず、選ばれた1件だけが公開されると伝える", async () => {
    vi.resetModules();
    vi.doMock("./_core/notification", () => ({ sendEmail: async (m: any) => { sent.push(m); } }));
    vi.doMock("./approvalToken", () => ({ createApprovalToken: () => "tok" }));
    const { sendApprovalDigestEmail } = await import("./approvalEmail");
    await sendApprovalDigestEmail({
      to: "x@example.test",
      userId: 3500,
      posts: [1, 2, 3].map((i) => ({ id: i, postContent: `案${i}`, scheduledAt: new Date(), choiceGroupId: g })),
    });
    const mail = sent[0];
    expect(mail.subject).toContain("3 案");
    expect(mail.subject).not.toContain("3 件");
    expect(mail.html).toContain("この案にする");
    expect(mail.html).toContain("選ばれなかった案は公開しません");
    expect(mail.html).toContain("押さなければ1件も公開されません");
    // 「本日ぶんの投稿 3件 を作成しました」に戻っていないこと
    expect(mail.html).not.toContain("<strong>3件</strong>");
    vi.doUnmock("./_core/notification");
    vi.doUnmock("./approvalToken");
  });

  it("ふつうの承認依頼メールは今までどおり", async () => {
    vi.resetModules();
    const sent2: any[] = [];
    vi.doMock("./_core/notification", () => ({ sendEmail: async (m: any) => { sent2.push(m); } }));
    vi.doMock("./approvalToken", () => ({ createApprovalToken: () => "tok" }));
    const { sendApprovalDigestEmail } = await import("./approvalEmail");
    await sendApprovalDigestEmail({
      to: "x@example.test",
      userId: 1,
      posts: [{ id: 1, postContent: "ふつうの投稿", scheduledAt: new Date() }],
    });
    expect(sent2[0].html).toContain("この内容で投稿する");
    expect(sent2[0].html).not.toContain("この案にする");
    vi.doUnmock("./_core/notification");
    vi.doUnmock("./approvalToken");
  });
});

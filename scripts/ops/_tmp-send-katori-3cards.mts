/**
 * 香取様（user 3500 / acc21 @shin_honetugi）へ、本日分の3案をいつもの承認カード（Flexカルーセル）でお送りする。
 * 2026-09-22 三上様のご指示：謝罪文を入れず、自動応答の体裁で3案から選んでいただく。
 *   確認: npx tsx <this> --dry
 *   送信: npx tsx <this> --send
 * ★bulk を付けない＝「すべて承認する」のクイックリプライは出さない（3件とも公開されないように）。
 */
const send = process.argv.includes("--send");

const USER_ID = 3500;
const ACCOUNT_ID = 21;
const PROJECT_ID = "line_mtjyu8a32xbnzj";
const ACCOUNT_NAME = "shin_honetugi";
// 本日15:00 JST（= 06:00 UTC）。3案とも同じ枠。
const SCHEDULED_AT = new Date("2026-09-22T06:00:00.000Z");

const DRAFTS: Array<{ angle: string; text: string }> = [
  {
    angle: "misconception",
    text: [
      "「腰を捻ると痛い」という方がいらっしゃいます。",
      "実は腰椎そのものは、ほとんど捻れません。",
      "捻る動きを担っているのは胸椎と股関節です。",
      "腰だけを揉んでも戻りやすいのは、そのためです。",
    ].join("\n"),
  },
  {
    angle: "story",
    text: [
      "足首を捻っても「歩けるから大丈夫」。",
      "部活動の学生さんによくある判断です。",
      "歩けても、骨の損傷が隠れていることがあります。",
      "当院ではエコーで確認してから方針を決めています。",
    ].join("\n"),
  },
  {
    angle: "local",
    text: [
      "平日は21時まで受付しております。",
      "部活動が終わってからでも間に合います。",
      "土浦市神立中央、予約優先制です。",
      "木曜午後は完全予約制となっております。",
    ].join("\n"),
  },
];

const LEAD_TEXT = [
  "本日の投稿が却下されましたので、あらためて3案をご用意しました。",
  "この中からお好きなものをお選びいただくか、「見送る」を押してください。",
].join("\n");

const db = await import("../../server/db");
const d = await db.getDb();
if (!d) { console.error("DBに接続できません"); process.exit(1); }
const { sql } = await import("drizzle-orm");

const [uRows]: any = await d.execute(
  sql`SELECT u.id, u.name, u.autoPublishIfNoResponse, u.autoPostRequireApproval, l.lineUserId
      FROM users u JOIN userLineLinks l ON l.id = (SELECT MIN(l2.id) FROM userLineLinks l2 WHERE l2.userId = u.id)
      WHERE u.id = ${USER_ID}`,
);
const u = uRows?.[0];
if (!u?.lineUserId) { console.error("LINE未連携"); process.exit(2); }
console.log(`宛先: user ${u.id} ${u.name} (${String(u.lineUserId).slice(0, 8)}…) 自動公開=${u.autoPublishIfNoResponse} 承認必須=${u.autoPostRequireApproval}`);
if (Number(u.autoPublishIfNoResponse) !== 0) {
  console.error("★中止：返事がなければ公開しない設定ではありません。3案が自動公開される恐れがあります。");
  process.exit(3);
}

// ★scheduledAt の比較は文字列で行う。Date を渡すとドライバが端末のTZ（JST）で
//   'YYYY-MM-DD HH:MM:SS' に変換するため、UTCで入っている値と一致せず 0件になる。
const SCHEDULED_SQL = "2026-09-22 06:00:00";

// 既に同じ枠の3案が入っていれば、それを使う（二重に作らない）
const [existing]: any = await d.execute(
  sql`SELECT id, postContent, scheduledAt, angle FROM scheduledPosts
      WHERE threadsAccountId = ${ACCOUNT_ID} AND status = 'awaiting_approval'
        AND scheduledAt = ${SCHEDULED_SQL} ORDER BY id ASC`,
);
const posts: any[] = [];
const toCard = (r: any) => ({ ...r, accountName: ACCOUNT_NAME, accountEmphasis: false });

if (existing.length > 0) {
  console.log(`既にこの枠の承認待ちが ${existing.length}件あります（id ${existing.map((r: any) => r.id).join(",")}）。作り直さずこれを送ります。`);
  if (existing.length !== DRAFTS.length) { console.error(`★中止：想定は${DRAFTS.length}件ですが${existing.length}件あります`); process.exit(4); }
  posts.push(...existing.map(toCard));
} else if (send) {
  for (const draft of DRAFTS) {
    await db.createScheduledPost({
      userId: USER_ID, projectId: PROJECT_ID, threadsAccountId: ACCOUNT_ID,
      scheduledAt: SCHEDULED_AT, status: "awaiting_approval", source: "auto",
      postContent: draft.text, angle: draft.angle, postLength: "short",
    } as any);
  }
  const [newRows]: any = await d.execute(
    sql`SELECT id, postContent, scheduledAt, angle FROM scheduledPosts
        WHERE threadsAccountId = ${ACCOUNT_ID} AND status = 'awaiting_approval'
          AND scheduledAt = ${SCHEDULED_SQL} ORDER BY id ASC`,
  );
  if (newRows.length !== DRAFTS.length) { console.error(`★中止：作成後の件数が合いません（${newRows.length}件）`); process.exit(4); }
  posts.push(...newRows.map(toCard));
} else {
  DRAFTS.forEach((draft, i) => posts.push(toCard({
    id: 9000 + i, postContent: draft.text, scheduledAt: SCHEDULED_AT, angle: draft.angle,
  })));
}
if (posts.length === 0) { console.error("★中止：送るカードがありません"); process.exit(4); }

const { buildPostCards } = await import("../../server/lineChat");
const card = buildPostCards(posts as any, {}); // ★bulk なし＝「すべて承認する」を出さない
const messages = [{ type: "text", text: LEAD_TEXT }, card];

console.log("--- 送る内容 ---");
console.log(LEAD_TEXT);
posts.forEach((p, i) => console.log(`\n[${i + 1}案] id=${p.id} angle=${p.angle}\n${p.postContent}`));
console.log(`\nカード枚数: ${posts.length}（カルーセル）／クイックリプライ: ${(card as any).quickReply ? "あり" : "なし"}`);

if (!send) { console.log("\n--dry のため送信していません"); process.exit(0); }

const { pushMessages } = await import("../../server/lineNotify");
const ok = await pushMessages(String(u.lineUserId), messages as any);
console.log(ok ? "送信完了" : "送信失敗");
process.exit(ok ? 0 : 5);

/**
 * セミナー用デモ配信（2026-09-16 21:00・三上さんのLINEだけ）
 *   npx tsx scripts/ops/seminar-demo.mts --dry|--send [userId=78]
 * 送るもの（順番）
 *   1. 開始の案内（ボタン：今日の投稿／投稿の成績／設定）
 *   2. 「朝のまとめ」と同じ作り（昨日の公開数＋承認待ち件数＋ボタン）
 *   3. 承認カード：いま承認待ちの投稿があればそれを再送。無ければ当日補充（玉島に+2の手動補填を当日限りで付けて生成→補填は0に戻す）
 *   4. Meta AI呼びかけカード（10時に届くものと同じ）
 * 送り先は userLineLinks の最初の1件（オーナー）だけ。他のお客様には一切送らない。
 * 必要なenv: DATABASE_URL, LINE_NOTIFY_CHANNEL_ACCESS_TOKEN, LINE_NOTIFY_CHANNEL_SECRET,
 *   BUILT_IN_FORGE_API_KEY, BUILT_IN_FORGE_API_URL, TOKEN_ENCRYPTION_KEY, JWT_SECRET, APP_BASE_URL（生成に必要）
 */
const [mode, uidArg] = process.argv.slice(2);
if (mode !== "--dry" && mode !== "--send") { console.error("usage: --dry|--send [userId]"); process.exit(1); }
const userId = Number(uidArg || 78);
const SEND = mode === "--send";
const JST = 9 * 3600_000;
const jstStr = (d: Date) => new Date(d.getTime() + JST).toISOString().slice(5, 16).replace("T", " ");

const db = await import("../../server/db");
const { textWithQuick } = await import("../../server/lineChat");
const { pushMessages, sendApprovalPush } = await import("../../server/lineNotify");

const lineIds = await db.getLineUserIdsForUser(userId);
if (lineIds.length === 0) { console.error("LINE未連携 user", userId); process.exit(2); }
const to = lineIds[0];
const user: any = await db.getUserById(userId);
console.log(`対象: user ${userId} ${user?.name ?? ""} → LINE ${String(to).slice(0, 8)}…（連携${lineIds.length}件のうちオーナー1件だけ）`);

const out: Array<{ label: string; msgs: unknown[] }> = [];

// 1. 開始の案内
out.push({ label: "① 開始の案内", msgs: [textWithQuick(
  "【セミナー用】これから、毎日実際に届く通知を順番にお送りします。\n" +
  "1通目：朝のまとめ（毎朝7:40に届くもの）\n2通目：投稿の確認カード（本文全文つき）\n3通目：Meta AI呼びかけ（毎朝10時に届くもの）\n\n" +
  "下のボタンは、いつもの「今日の投稿」「投稿の成績」「設定」と同じ動きをします。",
  [{ label: "今日の投稿", data: "m=posts" }, { label: "投稿の成績", data: "m=stats" }, { label: "設定", data: "m=settings" }],
)] });

// 2. 朝のまとめと同じ作り
{
  const { buildDailyCountTextForUser, yesterdayLabelJst } = await import("../../server/dailyPostCountReport");
  const stats = await db.getYesterdayAutoPostStatsByAccount();
  const rows = stats.filter((r: any) => r.userId === userId);
  const count = rows.length ? await buildDailyCountTextForUser(userId, rows as any, yesterdayLabelJst()) : null;
  const awaiting = await db.getRecentAwaitingApprovalPosts(userId, 60 * 24).catch(() => [] as any[]);
  const awaitingText = awaiting.length > 0 ? `承認をお待ちしている投稿が ${awaiting.length}件 あります。「今日の投稿」から公開できます。` : "いま承認をお待ちしている投稿はありません。";
  const text = ["【朝のまとめ（見本）】毎朝7:40に、この1通だけが届きます。", count?.text ?? "（昨日の公開数：該当なし）", awaitingText].join("\n\n");
  out.push({ label: "② 朝のまとめ", msgs: [textWithQuick(text, [
    { label: "今日の投稿", data: "m=posts" }, { label: "すべて承認する", data: "a=okall" },
    { label: "自動にする（確認なし）", data: "c=automode&v=on" }, { label: "設定", data: "m=settings" }, { label: "使い方", data: "m=help" },
  ])] });
}

// 3. 承認カード（あるものを再送。無ければ当日補充で作る）
let approvalPlan: string;
const now = new Date();
let awaitingPosts: any[] = (await db.getRecentAwaitingApprovalPosts(userId, 60 * 24).catch(() => [] as any[]))
  .filter((p: any) => p.angle !== "pinned" && new Date(p.scheduledAt).getTime() > now.getTime());
if (awaitingPosts.length > 0) {
  approvalPlan = `承認待ち ${awaitingPosts.length}件を再送: ` + awaitingPosts.map((p: any) => `#${p.id} ${jstStr(new Date(p.scheduledAt))}`).join(", ");
} else {
  approvalPlan = "承認待ちが無いので当日補充（玉島 account 10 に当日限りの手動補填+2 → 生成 → 補填0に戻す）。カードは生成処理が自動で送る";
}
console.log("③ 承認カード:", approvalPlan);

// 4. Meta AI呼びかけ
const { buildTodayCallsForUser, todayIndexJst, buildMetaAiCallBundle } = await import("../../server/metaAiCallPrompt");
const calls = await buildTodayCallsForUser(userId, todayIndexJst(), {});
const metaMsgs = calls.length ? buildMetaAiCallBundle(calls.map((c) => ({ username: c.username, storeName: c.storeName, text: c.text }))) : [];
console.log(`④ Meta AI呼びかけ: ${calls.length}アカウント分 ` + calls.map((c) => `@${c.username}「${c.text}」`).join(" / "));

for (const o of out) console.log(`\n--- ${o.label} ---\n` + JSON.stringify(o.msgs, null, 1).slice(0, 1800));

if (!SEND) { console.log("\n(dry) 送信していません"); process.exit(0); }

// ---- 送信 ----
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (const o of out) { const ok = await pushMessages(to, o.msgs); console.log(`${o.label}: ${ok ? "送信" : "失敗"}`); await sleep(1500); }

if (awaitingPosts.length > 0) {
  const ok = await sendApprovalPush(to, awaitingPosts.slice(0, 3).map((p: any) => ({ id: p.id, postContent: p.postContent, scheduledAt: p.scheduledAt })));
  console.log(`③ 承認カード再送: ${ok ? "送信" : "失敗"}`);
} else {
  const ACCOUNT_ID = 10; // Moveact 玉島店（@moveact_pilates_tamashima）
  const todayJst = new Date(now.getTime() + JST).toISOString().slice(0, 10);
  {
    const d = await db.getDb(); const { sql } = await import("drizzle-orm");
    await d!.execute(sql`UPDATE threadsAccounts SET extraPostsPerDay=2, extraPostsUntil=${todayJst}, extraPostsReason='セミナーデモ（当日限り）' WHERE id=${ACCOUNT_ID}`);
    console.log("③ 玉島に当日限りの手動補填+2を設定");
  }
  try {
    const { processAutoPostGeneration } = await import("../../server/autoPostScheduler");
    const r = await processAutoPostGeneration({ onlyUserId: userId, fillToday: true });
    console.log("③ 当日補充の結果:", JSON.stringify(r));
  } finally {
    const d = await db.getDb(); const { sql } = await import("drizzle-orm");
    await d!.execute(sql`UPDATE threadsAccounts SET extraPostsPerDay=0, extraPostsUntil=NULL, extraPostsReason=NULL WHERE id=${ACCOUNT_ID}`);
    console.log("③ 手動補填を0に戻しました");
  }
}
await sleep(1500);
if (metaMsgs.length) { const ok = await pushMessages(to, metaMsgs); console.log(`④ Meta AI呼びかけ: ${ok ? "送信" : "失敗"}`); }
console.log("完了");
process.exit(0);

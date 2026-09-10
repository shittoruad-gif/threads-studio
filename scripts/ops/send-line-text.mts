/**
 * 1人のお客様に、ファイルの文面をそのままLINEで送る（運営が承諾済みの個別連絡用）。
 *   npx tsx scripts/ops/send-line-text.mts --dry|--send <userId> <textfile>
 * 必要なenv: DATABASE_URL（トンネル）, LINE_NOTIFY_CHANNEL_ACCESS_TOKEN, LINE_NOTIFY_CHANNEL_SECRET
 * 送り先はそのお客様のオーナー（最初に連携したLINE）だけ。
 */
const [mode, uid, file] = process.argv.slice(2);
if (!mode || !uid || !file) { console.error("usage: --dry|--send <userId> <textfile>"); process.exit(1); }
const fs = await import("node:fs");
const text = fs.readFileSync(file, "utf8").trim();
const db = await import("../../server/db"); const d = await db.getDb(); const { sql } = await import("drizzle-orm");
const rows: any = ((await d!.execute(sql`SELECT u.name, l.lineUserId FROM users u JOIN userLineLinks l ON l.id = (SELECT MIN(l2.id) FROM userLineLinks l2 WHERE l2.userId = u.id) WHERE u.id = ${Number(uid)}`)) as any)[0];
const r = rows?.[0];
if (!r) { console.error("LINE未連携または該当なし user", uid); process.exit(2); }
console.log(`to: user ${uid} ${r.name} (${String(r.lineUserId).slice(0, 8)}…) ${Array.from(text).length}字`);
if (mode === "--send") {
  const { pushMessages } = await import("../../server/lineNotify");
  const ok = await pushMessages(String(r.lineUserId), [{ type: "text", text }]);
  console.log(ok ? "送信完了" : "送信失敗");
  process.exit(ok ? 0 : 3);
}
console.log("---\n" + text);
process.exit(0);

/**
 * 1人のお客様に、承諾済みの文面をボタン付きでLINEで送る（運営の個別連絡用）。
 *   npx tsx scripts/ops/send-line-with-buttons.mts --dry|--send <userId> <textfile> "ラベル=postback" ["ラベル=postback" ...]
 * 例: --send 2768 msg.txt "理想の投稿を貼る=c=ideal&p=xxx" "ピン留めのやり方=n=pinhow"
 * 必要なenv: DATABASE_URL（トンネル）, LINE_NOTIFY_CHANNEL_ACCESS_TOKEN, LINE_NOTIFY_CHANNEL_SECRET
 * 送り先はそのお客様のオーナー（最初に連携したLINE）だけ。★必ず三上さんの承諾済みの文面だけを送ること。
 */
const [mode, uid, file, ...btnArgs] = process.argv.slice(2);
if (!mode || !uid || !file) { console.error("usage: --dry|--send <userId> <textfile> [label=postback ...]"); process.exit(1); }
const fs = await import("node:fs");
const text = fs.readFileSync(file, "utf8").trim();
if (text.length === 0 || text.length > 4900) { console.error("文面の長さが不正:", text.length); process.exit(1); }
const items = btnArgs.map((s) => { const i = s.indexOf("="); return { label: s.slice(0, i), data: s.slice(i + 1) }; });
for (const it of items) if (!it.label || !it.data || Array.from(it.label).length > 20) { console.error("ボタンが不正:", JSON.stringify(it)); process.exit(1); }
const db = await import("../../server/db"); const d = await db.getDb(); const { sql } = await import("drizzle-orm");
const rows: any = ((await d!.execute(sql`SELECT u.name, l.lineUserId FROM users u JOIN userLineLinks l ON l.id = (SELECT MIN(l2.id) FROM userLineLinks l2 WHERE l2.userId = u.id) WHERE u.id = ${Number(uid)}`)) as any)[0];
const r = rows?.[0];
if (!r) { console.error("LINE未連携または該当なし user", uid); process.exit(2); }
const { textWithQuick } = await import("../../server/lineChat");
const msg = items.length ? textWithQuick(text, items as any) : { type: "text", text };
console.log(`to: user ${uid} ${r.name} (${String(r.lineUserId).slice(0, 8)}…) ${Array.from(text).length}字 ボタン${items.length}個`);
console.log(JSON.stringify(msg, null, 1).slice(0, 2500));
if (mode === "--send") {
  const { pushMessages } = await import("../../server/lineNotify");
  const ok = await pushMessages(String(r.lineUserId), [msg]);
  console.log(ok ? "送信完了" : "送信失敗");
  process.exit(ok ? 0 : 3);
}
process.exit(0);

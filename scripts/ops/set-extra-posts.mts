/**
 * 届かなかった投稿の補填を設定する（期間限定で1日＋n件）。
 *   npx tsx scripts/ops/set-extra-posts.mts <accountId> <perDay> <untilYYYY-MM-DD> "<理由>"
 *   例: npx tsx scripts/ops/set-extra-posts.mts 22 1 2026-09-16 "9/8〜9/10に届かなかった6件の補填（9/11〜9/16は1日4件）"
 *   解除: perDay=0
 * 本番DBはトンネル（DATABASE_URL=mysql://mysql:<pw>@127.0.0.1:13308/threads_studio）で。
 */
const [id, perDay, until, reason] = process.argv.slice(2);
if (!id || perDay === undefined) { console.error("usage: <accountId> <perDay> <untilYYYY-MM-DD> <reason>"); process.exit(1); }
const db = await import("../../server/db");
const d = await db.getDb();
const { sql } = await import("drizzle-orm");
await d!.execute(sql`UPDATE threadsAccounts SET extraPostsPerDay = ${Number(perDay)}, extraPostsUntil = ${Number(perDay) > 0 ? until : null}, extraPostsReason = ${Number(perDay) > 0 ? String(reason || "").slice(0, 200) : null} WHERE id = ${Number(id)}`);
const rows: any = (await d!.execute(sql`SELECT id, threadsUsername, extraPostsPerDay, extraPostsUntil, extraPostsReason FROM threadsAccounts WHERE id = ${Number(id)}`)) as any;
console.log(rows[0]?.[0]);
process.exit(0);

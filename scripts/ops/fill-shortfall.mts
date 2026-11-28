/**
 * 朝6時の生成で枠が消えたアカウントを見つけて、その日のうちに当日補充する（運営の定型手順）。
 *   npx tsx scripts/ops/fill-shortfall.mts --dry     … 対象と不足数を出すだけ
 *   npx tsx scripts/ops/fill-shortfall.mts --fill    … 不足のあるユーザーに当日補充を実行（承認カードはいつもどおり届く）
 *   npx tsx scripts/ops/fill-shortfall.mts --fill 3500 2768 … 指定ユーザーだけ
 * 必要なenv: DATABASE_URL（トンネル）, BUILT_IN_FORGE_API_KEY/URL, TOKEN_ENCRYPTION_KEY, JWT_SECRET, APP_BASE_URL,
 *            LINE_NOTIFY_CHANNEL_ACCESS_TOKEN, LINE_NOTIFY_CHANNEL_SECRET, RESEND_API_KEY, RESEND_FROM_DOMAIN, SUPPORT_REPLY_TO, EMAIL_FROM
 * 手順書: docs/runbook-quality-shortfall.md
 *
 * ★公開前に確認されるお客様（承認カードで確認）は、既定では補充しない（2026-11-28 三上様「3つまとめて送るようにして」）。
 *   朝6時の回の中で1度作り直してからカードを1通にまとめて送るようにしたので、ここで後から足すと
 *   カードが別に届き「いつもは3件まとめてなのに」となる（岩根様 11/28）。足りない分は翌朝の回にまとめて足される。
 *   どうしても今日足すときだけ --include-approval を付ける。
 */
const rawArgs = process.argv.slice(2);
const includeApproval = rawArgs.includes("--include-approval");
const args = rawArgs.filter((a) => a !== "--include-approval");
const mode = args[0] === "--fill" ? "fill" : "dry";
const only = args.slice(1).map(Number).filter((n) => Number.isFinite(n) && n > 0);
const db = await import("../../server/db"); const d = await db.getDb(); const { sql } = await import("drizzle-orm");
// 今朝の生成で「届かなかった枠」を記録した（shortfallDate=今日・shortfallCount>0）アカウント
const rows: any = ((await d!.execute(sql`
  SELECT ta.id accountId, ta.userId, ta.threadsUsername, u.storeName, ta.shortfallCount,
         COALESCE(ta.autoPostRequireApproval, u.autoPostRequireApproval, 0) approval,
         (SELECT COUNT(*) FROM scheduledPosts sp WHERE sp.threadsAccountId = ta.id AND sp.source = 'auto'
            AND sp.status IN ('awaiting_approval','pending','posted','processing')
            AND DATE(CONVERT_TZ(sp.scheduledAt,'+00:00','+09:00')) = DATE(CONVERT_TZ(NOW(),'+00:00','+09:00'))) todayPosts
  FROM threadsAccounts ta JOIN users u ON u.id = ta.userId
  WHERE ta.isActive = 1 AND ta.shortfallDate = DATE(CONVERT_TZ(NOW(),'+00:00','+09:00')) AND ta.shortfallCount > 0
  ORDER BY ta.userId`)) as any)[0];
if (rows.length === 0) { console.log("今朝の生成で消えた枠はありません。"); process.exit(0); }
console.log("今朝の生成で消えた枠:");
for (const r of rows) console.log(`  user=${r.userId} ${r.storeName ?? ""} @${r.threadsUsername} 不足${r.shortfallCount}件（今日の投稿 ${r.todayPosts}件）${Number(r.approval) ? "［承認カードの方：既定では補充しない・翌朝にまとめて足す］" : ""}`);
if (mode === "dry") process.exit(0);
const approvalUsers = new Set(rows.filter((r: any) => Number(r.approval)).map((r: any) => Number(r.userId)));
const users = Array.from(new Set(rows.map((r: any) => Number(r.userId))))
  .filter((u) => only.length === 0 || only.includes(u))
  .filter((u) => includeApproval || !approvalUsers.has(u));
const { processAutoPostGeneration } = await import("../../server/autoPostScheduler");
for (const u of users) {
  const r = await processAutoPostGeneration({ onlyUserId: u, fillToday: true } as any);
  console.log(`FILL user=${u} generated=${r.generated} failed=${r.failed}`);
}
const after: any = ((await d!.execute(sql`
  SELECT ta.userId, ta.threadsUsername,
         (SELECT COUNT(*) FROM scheduledPosts sp WHERE sp.threadsAccountId = ta.id AND sp.source = 'auto'
            AND sp.status IN ('awaiting_approval','pending','posted','processing')
            AND DATE(CONVERT_TZ(sp.scheduledAt,'+00:00','+09:00')) = DATE(CONVERT_TZ(NOW(),'+00:00','+09:00'))) todayPosts
  FROM threadsAccounts ta WHERE ta.id IN (${sql.join(rows.map((r: any) => sql`${Number(r.accountId)}`), sql`, `)})`)) as any)[0];
console.log("補充後の今日の本数:");
for (const r of after) console.log(`  user=${r.userId} @${r.threadsUsername} ${r.todayPosts}件`);
process.exit(0);

/**
 * ネタ帳フォームのリンクを作る（2026-09-30・server/materialLedger.ts）。お客様へは送らない（送るのは三上様の承諾後）。
 *   npx tsx scripts/ops/material-form-link.mts <userId|projectId> [--status]
 * 必要なenv: DATABASE_URL（トンネル）, JWT_SECRET, APP_BASE_URL
 */
const arg = process.argv[2];
if (!arg) { console.error("使い方: material-form-link.mts <userId|projectId> [--status]"); process.exit(1); }
const db = await import("../../server/db");
const ml = await import("../../server/materialLedger");
const projects: any[] = /^\d+$/.test(arg) ? await db.getUserProjects(Number(arg)) : [await db.getProjectById(arg)].filter(Boolean);
if (projects.length === 0) { console.error("お店の情報が見つかりません"); process.exit(1); }
for (const p of projects) {
  console.log(`${p.storeName || p.title}（${p.id}）`);
  console.log(`  ${ml.materialFormUrl(String(p.id))}`);
  if (process.argv.includes("--status")) console.log("  ネタ帳:", JSON.stringify(await ml.getLedgerStatus(String(p.id))));
}
process.exit(0);

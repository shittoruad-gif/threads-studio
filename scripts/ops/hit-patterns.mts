/**
 * 他店の当たり型を貯める（2026-09-28 三上様指示・server/hitPatterns.ts）。
 *   npx tsx scripts/ops/hit-patterns.mts --dry [--limit 10]   … 表示だけ（書き込まない）
 *   npx tsx scripts/ops/hit-patterns.mts [--limit 60]         … hitPatterns に入れる
 * 必要なenv: DATABASE_URL・BUILT_IN_FORGE_API_KEY・BUILT_IN_FORGE_API_URL（本番は prod-env.sh をサブシェルで）
 */
const dryRun = process.argv.includes("--dry");
const li = process.argv.indexOf("--limit");
const limit = li > 0 ? Number(process.argv[li + 1]) : undefined;
const { refreshHitPatterns } = await import("../../server/hitPatterns");
const r = await refreshHitPatterns({ dryRun, limit });
for (const l of r.lines) console.log(l);
console.log(`--- 当たり候補${r.candidates}件のうち 採用${r.added}・不採用${r.rejected}${dryRun ? "（表示だけ）" : ""}`);
process.exit(0);

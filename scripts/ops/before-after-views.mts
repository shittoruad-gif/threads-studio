/**
 * 導入前後の閲覧数（Threads APIの実測）。各アカウントの投稿を連携日の前後に分け、
 * 「1投稿あたりの表示数」「1日あたりの表示数」を比べる。営業資料・お客様への報告用。
 *   実行: DATABASE_URL=... TOKEN_ENCRYPTION_KEY=... npx tsx scripts/ops/before-after-views.mts [--days 30] [--csv out.csv]
 * 注意: 表示数はThreadsの「views」（投稿が表示された回数）。導入前の投稿は本人がアプリから出したもの。
 */
const args = process.argv.slice(2);
const days = Number(args[args.indexOf("--days") + 1] || 30);
const csvPath = args.includes("--csv") ? args[args.indexOf("--csv") + 1] : null;
const db = await import("../../server/db");
const d = await db.getDb(); const { sql } = await import("drizzle-orm");
const accts: any[] = ((await d!.execute(sql`SELECT ta.id, ta.threadsUsername, ta.threadsUserId, ta.createdAt, u.name, u.isDemoMode FROM threadsAccounts ta JOIN users u ON u.id=ta.userId WHERE ta.isActive=1 ORDER BY ta.id`)) as any)[0];
const get = async (u: string) => (await fetch(u)).json() as any;
const out: string[] = [];
const header = ["アカウント", "連携日", "導入前: 投稿数/日数", "導入前: 1投稿あたり表示", "導入前: 1日あたり表示", "導入後: 投稿数/日数", "導入後: 1投稿あたり表示", "導入後: 1日あたり表示", "1日あたり倍率"];
console.log(header.join(" | ")); out.push(header.join(","));
for (const a of accts) {
  if (a.isDemoMode) continue;
  const full: any = await db.getThreadsAccountById(Number(a.id)); const tok = full?.accessToken; if (!tok) continue;
  const connect = new Date(a.createdAt).getTime();
  const since = Math.floor((connect - days * 86400000) / 1000);
  // 投稿を集める（ページング・最大200件）
  let url = `https://graph.threads.net/v1.0/${a.threadsUserId}/threads?fields=id,timestamp,is_reply&limit=100&since=${since}&access_token=${tok}`;
  const posts: any[] = [];
  for (let i = 0; i < 2 && url; i++) { const r = await get(url); if (r.error) { console.log(`@${a.threadsUsername}: ${String(r.error.message).slice(0, 60)}`); break; } posts.push(...(r.data ?? [])); url = r.paging?.next || ""; }
  const main = posts.filter((p) => !p.is_reply);
  const views = async (id: string) => { const r = await get(`https://graph.threads.net/v1.0/${id}/insights?metric=views&access_token=${tok}`); return Number(r.data?.[0]?.values?.[0]?.value ?? r.data?.[0]?.total_value?.value ?? 0); };
  const before = main.filter((p) => new Date(p.timestamp).getTime() < connect);
  const after = main.filter((p) => new Date(p.timestamp).getTime() >= connect);
  let vb = 0; for (const p of before) vb += await views(p.id);
  let va = 0; for (const p of after) va += await views(p.id);
  const daysBefore = days; const daysAfter = Math.max(1, Math.ceil((Date.now() - connect) / 86400000));
  const perPostB = before.length ? Math.round(vb / before.length) : 0, perPostA = after.length ? Math.round(va / after.length) : 0;
  const perDayB = Math.round(vb / daysBefore), perDayA = Math.round(va / daysAfter);
  const ratio = perDayB > 0 ? (perDayA / perDayB).toFixed(1) + "倍" : (perDayA > 0 ? "導入前0" : "-");
  const row = [`@${a.threadsUsername}`, new Date(connect + 9 * 3600e3).toISOString().slice(0, 10), `${before.length}件/${daysBefore}日`, String(perPostB), String(perDayB), `${after.length}件/${daysAfter}日`, String(perPostA), String(perDayA), ratio];
  console.log(row.join(" | ")); out.push(row.join(","));
}
if (csvPath) { const fs = await import("node:fs"); fs.writeFileSync(csvPath, "﻿" + out.join("\n")); console.log("csv:", csvPath); }
process.exit(0);

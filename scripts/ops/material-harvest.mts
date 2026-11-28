/**
 * ネタの補充を手で見る・手で回す（server/materialHarvest.ts）。
 *   読むだけ: eval "$(bash scripts/ops/prod-env.sh DATABASE_URL …)"; npx tsx scripts/ops/material-harvest.mts --dry
 *   足す    : 同じく --run（運営への知らせは出さない。足した内容を画面に出す）
 *   ホームページの候補を足す: --site-add <accountId>（毎朝の自動は候補を出すだけ。運営が中身を見てから足す）
 *   ホームページの候補を見る: --site-dry <accountId> [URL]（URL を付けると、登録に無いページを読むだけ読む）
 * --dry / --run は、返信も曜日に関係なく読む（毎朝の自動は月・木だけ）。
 */
const mode = process.argv[2];
if (!['--dry', '--run', '--site-add', '--site-dry'].includes(String(mode))) { console.error('使い方: material-harvest.mts --dry | --run | --site-add <accountId> | --site-dry <accountId> [URL]'); process.exit(1); }
if (mode === '--site-add' || mode === '--site-dry') {
  const accountId = Number(process.argv[3]);
  if (!Number.isFinite(accountId) || accountId <= 0) { console.error('accountId を付けてください'); process.exit(1); }
  const db = await import('../../server/db');
  const acct: any = await db.getThreadsAccountById(accountId);
  if (!acct) { console.error(`account ${accountId} が見つかりません`); process.exit(1); }
  let projectId: string | null = acct.defaultProjectId ? String(acct.defaultProjectId) : null;
  if (!projectId) {
    const ps: any[] = ((await db.getProjectsByUserId(acct.userId)) || []).filter((p: any) => !String(p.id).startsWith('demo_'));
    projectId = ps[0]?.id ? String(ps[0].id) : null;
  }
  if (!projectId) { console.error('お店の情報が見つかりません'); process.exit(1); }
  const { harvestSiteForProject } = await import('../../server/materialHarvest');
  const url = process.argv[4];
  const r = await harvestSiteForProject(Number(acct.userId), projectId, { dry: mode === '--site-dry', force: true, url: url || undefined });
  console.log(`account ${accountId}（@${acct.threadsUsername}） ${r.url ?? '（URLなし）'} → ${r.state}${r.note ? `（${r.note}）` : ''} ${r.added.length}件${mode === '--site-add' && r.state === 'added' ? ' をネタ帳に足しました' : ''}`);
  for (const it of r.added) console.log(`　- ${it.kind === 'faq' ? '質問' : '話'}：${it.content}`);
  process.exit(0);
}
const { runMaterialHarvest, harvestReportText } = await import('../../server/materialHarvest');
const list = await runMaterialHarvest({ dry: mode === '--dry', repliesToday: true });
console.log(list.length === 0 ? '補充の対象になるアカウントはありません。' : harvestReportText(list));
for (const x of list.filter((r) => r.state === 'skipped')) console.log(`・account ${x.accountId}（@${x.username}）${x.reason} → 前回の補充から日が浅いので今回は見送り`);
process.exit(0);

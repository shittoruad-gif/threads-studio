/**
 * ネタの補充を手で見る・手で回す（server/materialHarvest.ts）。
 *   読むだけ: eval "$(bash scripts/ops/prod-env.sh DATABASE_URL …)"; npx tsx scripts/ops/material-harvest.mts --dry
 *   足す    : 同じく --run（運営への知らせは出さない。足した内容を画面に出す）
 */
const mode = process.argv[2];
if (mode !== '--dry' && mode !== '--run') { console.error('使い方: material-harvest.mts --dry | --run'); process.exit(1); }
const { runMaterialHarvest, harvestReportText } = await import('../../server/materialHarvest');
const list = await runMaterialHarvest({ dry: mode === '--dry' });
console.log(list.length === 0 ? '補充の対象になるアカウントはありません。' : harvestReportText(list));
for (const x of list.filter((r) => r.state === 'skipped')) console.log(`・account ${x.accountId}（@${x.username}）${x.reason} → 前回の補充から日が浅いので今回は見送り`);
process.exit(0);

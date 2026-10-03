/**
 * 試し生成（本番データを読むだけ・記録も投稿も書かない）。
 *   AUTOPOST_DRY_RUN=1 を必ず立ててから server を読み込む。
 *   使い方: DRY_TARGETS='[{"accountId":21,"projectId":"line_xxx","n":3}]' DRY_OUT=out.json npx tsx scripts/ops/autopost-dryrun.mts
 */
process.env.AUTOPOST_DRY_RUN = '1';
import { writeFileSync } from 'node:fs';
const db: any = await import('../../server/db');
const { generateAutoPost } = await import('../../server/autoPostScheduler');
const d = await db.getDb(); const { sql } = await import('drizzle-orm');
const targets = JSON.parse(process.env.DRY_TARGETS || '[]');
const out: any[] = [];
for (const t of targets) {
  const p = await db.getProjectById(t.projectId);
  const acc: any = ((await d.execute(sql`SELECT id, userId, postLength FROM threadsAccounts WHERE id=${t.accountId}`))[0] as any[])[0];
  for (let k = 0; k < (t.n ?? 3); k++) {
    let got: any = null;
    for (let attempt = 1; attempt <= 3 && !got; attempt++) {
      await generateAutoPost(acc.userId, p, k, k, t.accountId, k, false, null, acc.postLength ?? null, null, null, attempt === 3, false,
        { collect: (x: any) => { got = x; } });
    }
    out.push({ account: t.accountId, k, angle: got?.angleId ?? null, content: got?.content ?? null });
    console.log(`--- account=${t.accountId} k=${k} angle=${got?.angleId}\n${got?.content ?? '(なし)'}`);
  }
}
if (process.env.DRY_OUT) writeFileSync(process.env.DRY_OUT, JSON.stringify(out, null, 2));
process.exit(0);

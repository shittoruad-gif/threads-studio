/**
 * ツリーの試し（shared/treeTrial.ts）の集計。読み取りのみ。
 * 学習用アカウントの期間中の自動投稿のうち「分けられる本文」（treeSplit が null でない）だけで、
 * ツリーで出した（id 奇数）／ふつうで出した（id 偶数）を、1本目の表示で比べる。公開から48時間たった投稿だけ。
 *   実行: ( eval "$(bash scripts/ops/prod-env.sh DATABASE_URL TOKEN_ENCRYPTION_KEY)" && npx tsx scripts/ops/tree-trial-report.mts )
 * 見方：アカウントごとの「ツリー中央値÷ふつう中央値」。両方20本以上で、3アカウントとも同じ向きなら傾向ありとみる。
 */
const { TREE_TRIAL, treeArm, treeSplit } = await import("../../shared/treeTrial");
const db = await import("../../server/db");
const { decrypt } = await import("../../server/encryption");
const d = await db.getDb(); const { sql } = await import("drizzle-orm");
const ids = TREE_TRIAL.accountIds.join(",");
const accts: any[] = ((await d!.execute(sql.raw(`SELECT id, threadsUsername, accessToken FROM threadsAccounts WHERE id IN (${ids})`))) as any)[0];
const posts: any[] = ((await d!.execute(sql.raw(`
  SELECT id, threadsAccountId, postContent, publishedThreadsPostId, postedAt FROM scheduledPosts
  WHERE threadsAccountId IN (${ids}) AND source = 'auto' AND status = 'posted' AND publishedThreadsPostId IS NOT NULL
    AND mediaItemId IS NULL AND pollOptions IS NULL AND quotePostId IS NULL AND (angle IS NULL OR angle <> 'spoiler_quiz')
    AND postedAt >= '${TREE_TRIAL.start} 00:00:00' - INTERVAL 9 HOUR AND postedAt <= '${TREE_TRIAL.until} 23:59:59' - INTERVAL 9 HOUR
    AND postedAt < UTC_TIMESTAMP() - INTERVAL 48 HOUR`))) as any)[0];
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const j = async (u: string) => (await fetch(u)).json() as any;
console.log(`ツリーの試し ${TREE_TRIAL.start}〜${TREE_TRIAL.until}（分けられる本文だけ・1本目の表示・公開48時間後）`);
for (const a of accts) {
  const tok = decrypt(a.accessToken);
  const target = posts.filter((p) => Number(p.threadsAccountId) === Number(a.id) && treeSplit(p.postContent));
  const rows: { tree: boolean; views: number; replies: number }[] = [];
  for (let k = 0; k < target.length; k += 8) {
    await Promise.all(target.slice(k, k + 8).map(async (p) => {
      const r = await j(`https://graph.threads.net/v1.0/${p.publishedThreadsPostId}/insights?metric=views,replies&access_token=${tok}`);
      if (r.error) return;
      const m: any = {}; for (const x of r.data ?? []) m[x.name] = Number(x.values?.[0]?.value ?? x.total_value?.value ?? 0);
      rows.push({ tree: treeArm(Number(p.id)) === "tree", views: m.views ?? 0, replies: m.replies ?? 0 });
    }));
  }
  const t = rows.filter((r) => r.tree), n = rows.filter((r) => !r.tree);
  const mt = med(t.map((r) => r.views)), mn = med(n.map((r) => r.views));
  const rr = (x: typeof rows) => x.length ? `${Math.round((x.filter((r) => r.replies > 0).length / x.length) * 100)}%` : "-";
  console.log(`@${a.threadsUsername}（${a.id}）ツリー ${t.length}本 中央値${mt} 返信あり${rr(t)} ／ ふつう ${n.length}本 中央値${mn} 返信あり${rr(n)} ／ 倍率 ${mn > 0 ? (mt / mn).toFixed(2) : "-"}`);
}
process.exit(0);

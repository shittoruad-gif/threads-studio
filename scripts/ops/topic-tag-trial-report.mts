/**
 * トピックの試し（shared/topicTagTrial.ts）の集計。読み取りのみ。
 * 学習用アカウントの期間中の投稿のうち「本文に合う言葉がある投稿」だけで、トピックを付けた／付けなかったを比べる
 * （合う言葉が無い投稿は、付ける側でも付かないので比べから外す）。公開から48時間たった投稿だけ。
 *   実行: ( eval "$(bash scripts/ops/prod-env.sh DATABASE_URL TOKEN_ENCRYPTION_KEY)" && npx tsx scripts/ops/topic-tag-trial-report.mts )
 * 見方：アカウントごとの「付けた中央値÷付けなかった中央値」。両方20本以上で、3アカウントとも同じ向きなら傾向ありとみる。
 */
const { TOPIC_TAG_TRIAL, contentTopicTag } = await import("../../shared/topicTagTrial");
const db = await import("../../server/db");
const { decrypt } = await import("../../server/encryption");
const d = await db.getDb(); const { sql } = await import("drizzle-orm");
const ids = TOPIC_TAG_TRIAL.accountIds.join(",");
// getThreadsAccountById は全列を読むため、本番に無い列があると落ちる。必要な列だけ読む
const accts: any[] = ((await d!.execute(sql.raw(`SELECT id, threadsUserId, threadsUsername, accessToken FROM threadsAccounts WHERE id IN (${ids})`))) as any)[0];
const since = Math.floor(new Date(`${TOPIC_TAG_TRIAL.start}T00:00:00+09:00`).getTime() / 1000);
const until = new Date(`${TOPIC_TAG_TRIAL.until}T23:59:59+09:00`).getTime();
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const j = async (u: string) => (await fetch(u)).json() as any;
console.log(`トピックの試し ${TOPIC_TAG_TRIAL.start}〜${TOPIC_TAG_TRIAL.until}（本文に合う言葉がある投稿だけ・公開48時間後）`);
for (const a of accts) {
  const tok = decrypt(a.accessToken);
  let url = `https://graph.threads.net/v1.0/${a.threadsUserId}/threads?fields=id,timestamp,topic_tag,is_reply,text&limit=100&since=${since}&access_token=${tok}`;
  const posts: any[] = [];
  for (let i = 0; i < 15 && url; i++) { const r = await j(url); if (r.error) { console.log(`acct ${a.id}: ${String(r.error.message).slice(0, 60)}`); break; } posts.push(...(r.data ?? [])); url = r.paging?.next || ""; }
  const target = posts.filter((p) => !p.is_reply && contentTopicTag(p.text) && Date.now() - new Date(p.timestamp).getTime() > 48 * 3600e3 && new Date(p.timestamp).getTime() <= until);
  const rows: { tag: boolean; views: number; replies: number }[] = [];
  for (let k = 0; k < target.length; k += 8) {
    await Promise.all(target.slice(k, k + 8).map(async (p) => {
      const r = await j(`https://graph.threads.net/v1.0/${p.id}/insights?metric=views,replies&access_token=${tok}`);
      const m: any = {}; for (const x of r.data ?? []) m[x.name] = Number(x.values?.[0]?.value ?? x.total_value?.value ?? 0);
      rows.push({ tag: !!p.topic_tag, views: m.views ?? 0, replies: m.replies ?? 0 });
    }));
  }
  const t = rows.filter((r) => r.tag), n = rows.filter((r) => !r.tag);
  const mt = med(t.map((r) => r.views)), mn = med(n.map((r) => r.views));
  const rr = (x: typeof rows) => x.length ? `${Math.round((x.filter((r) => r.replies > 0).length / x.length) * 100)}%` : "-";
  console.log(`@${a.threadsUsername}（${a.id}）付けた ${t.length}本 中央値${mt} 返信あり${rr(t)} ／ 付けなかった ${n.length}本 中央値${mn} 返信あり${rr(n)} ／ 倍率 ${mn > 0 ? (mt / mn).toFixed(2) : "-"}`);
}
process.exit(0);

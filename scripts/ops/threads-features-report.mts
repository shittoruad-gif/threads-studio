/**
 * Threads の機能の試し（shared/threadsFeatures.ts・2026-10-28〜11-30）の結果を見る。
 *
 *   npx tsx scripts/ops/threads-features-report.mts
 *
 * アカウントごとに、機能の投稿（アンケート・クイズ）の閲覧数を「同じ期間の普段の投稿の中央値」と比べる。
 * アンケートは投票数と割合を Threads から読む（poll_attachment）。再投稿は元の投稿と日付だけを出す。
 */
const db = await import("../../server/db");
const d = await db.getDb();
const { sql } = await import("drizzle-orm");
if (!d) { console.error("DBに接続できません"); process.exit(1); }
const { FEATURE_TRIAL } = await import("../../shared/threadsFeatures");
const q = async (s: any) => ((await d.execute(s))[0] as any[]);
const LABEL: Record<string, string> = { poll: "アンケート", spoiler_quiz: "クイズ（答えを隠す）", repost: "再投稿" };

for (const accountId of FEATURE_TRIAL.accountIds) {
  const acc: any = await db.getThreadsAccountById(accountId);
  console.log(`\n■ @${acc?.threadsUsername ?? accountId}`);
  const rows = await q(sql`
    SELECT p.id, p.angle, p.pollOptions, p.postedAt, p.publishedThreadsPostId, p.quotePostId,
      (SELECT MAX(a.impressions) FROM postAnalytics a WHERE a.threadsPostId = p.publishedThreadsPostId) AS imp,
      (SELECT MAX(a.likes) + MAX(a.replies) FROM postAnalytics a WHERE a.threadsPostId = p.publishedThreadsPostId) AS eng
    FROM scheduledPosts p
    WHERE p.threadsAccountId = ${accountId} AND p.status = 'posted'
      AND p.postedAt >= ${FEATURE_TRIAL.start} AND p.postedAt < DATE_ADD(${FEATURE_TRIAL.end}, INTERVAL 1 DAY)
      AND p.replyToThreadsId IS NULL
    ORDER BY p.postedAt`);
  const normal = rows.filter((r) => !LABEL[r.angle] && r.quotePostId == null && r.imp != null).map((r) => Number(r.imp)).sort((a, b) => a - b);
  const med = normal.length ? normal[Math.floor(normal.length / 2)] : null;
  console.log(`  普段の投稿 ${normal.length}本・閲覧の中央値 ${med ?? "—"}`);
  for (const r of rows.filter((x) => LABEL[x.angle])) {
    const day = new Date(new Date(r.postedAt).getTime() + 9 * 3600_000).toISOString().slice(5, 10);
    if (r.angle === "repost") { console.log(`  ${day} ${LABEL.repost}：元の投稿 ${r.quotePostId}`); continue; }
    const ratio = med && r.imp != null ? `（普段の${(Number(r.imp) / med).toFixed(1)}倍）` : "";
    let poll = "";
    if (r.pollOptions && r.publishedThreadsPostId && acc?.accessToken) {
      try {
        const f = "poll_attachment{option_a,option_b,option_c,option_d,option_a_votes_percentage,option_b_votes_percentage,option_c_votes_percentage,option_d_votes_percentage,total_votes}";
        const res: any = await (await fetch(`https://graph.threads.net/v1.0/${r.publishedThreadsPostId}?fields=${encodeURIComponent(f)}&access_token=${encodeURIComponent(acc.accessToken)}`)).json();
        const pa = res?.poll_attachment;
        if (pa) {
          const parts = ["a", "b", "c", "d"].filter((k) => pa[`option_${k}`]).map((k) => `${pa[`option_${k}`]} ${Math.round(Number(pa[`option_${k}_votes_percentage`] ?? 0) * 100)}%`);
          poll = `\n      投票 ${pa.total_votes ?? 0}票：${parts.join("／")}`;
        } else poll = `\n      投票を読めませんでした：${JSON.stringify(res).slice(0, 100)}`;
      } catch (e) { poll = `\n      投票を読めませんでした：${(e as Error).message}`; }
    }
    console.log(`  ${day} ${LABEL[r.angle]}：閲覧 ${r.imp ?? "未取得"}${ratio}・いいね＋返信 ${r.eng ?? "—"}${r.angle === "poll" && !r.pollOptions ? "（選択肢を作れずアンケートなしで公開）" : ""}${poll}`);
  }
}
process.exit(0);

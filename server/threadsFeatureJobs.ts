/**
 * Threads の機能の試し：日曜の再投稿（2026-09-28 三上様指示・shared/threadsFeatures.ts）。
 *
 * 試しのアカウントだけ、日曜12:30（日本時間）に「7〜21日前に公開して、いちばん読まれた自分の投稿」を1本再投稿する。
 * 再投稿はフォロワーのフィードにもう一度出る（POST /{threads_id}/repost）。新しい本文は作らない。
 *
 * ★同じ投稿は二度と再投稿しない（scheduledPosts の angle='repost' の記録で見る）。
 * ★読まれた数が普段の中央値より多い投稿だけ。当たりが無い週はしない。
 * ★コメント返信・引用・Meta AI呼びかけは対象外（本文の投稿だけ）。
 */
import { sql } from "drizzle-orm";
import * as db from "./db";
import { FEATURE_TRIAL, isRepostDay } from "../shared/threadsFeatures";

const THREADS_GRAPH_URL = "https://graph.threads.net/v1.0";

export async function pickRepostTarget(accountId: number): Promise<{ threadsPostId: string; impressions: number; median: number } | null> {
  const database = await db.getDb();
  if (!database) return null;
  const rows: any[] = ((await database.execute(sql`
    SELECT a.threadsPostId, MAX(a.impressions) AS imp, MAX(a.postedAt) AS postedAt
    FROM postAnalytics a
    WHERE a.threadsAccountId = ${accountId} AND a.postedAt >= DATE_SUB(NOW(), INTERVAL 60 DAY)
    GROUP BY a.threadsPostId`)) as any)[0] ?? [];
  if (rows.length < 5) return null;
  const imps = rows.map((r) => Number(r.imp ?? 0)).sort((a, b) => a - b);
  const median = imps[Math.floor(imps.length / 2)];
  const reposted: any[] = ((await database.execute(sql`
    SELECT quotePostId FROM scheduledPosts WHERE threadsAccountId = ${accountId} AND angle = 'repost' AND quotePostId IS NOT NULL`)) as any)[0] ?? [];
  const done = new Set(reposted.map((r) => String(r.quotePostId)));
  // 本文の投稿だけ（返信・引用・呼びかけは除く）
  const own: any[] = ((await database.execute(sql`
    SELECT publishedThreadsPostId AS id FROM scheduledPosts
    WHERE threadsAccountId = ${accountId} AND status = 'posted' AND publishedThreadsPostId IS NOT NULL
      AND replyToThreadsId IS NULL AND quotePostId IS NULL AND (angle IS NULL OR angle NOT IN ('meta_ai_call', 'pinned', 'repost'))`)) as any)[0] ?? [];
  const ownIds = new Set(own.map((r) => String(r.id)));
  const now = Date.now();
  const cands = rows
    .filter((r) => {
      const age = (now - new Date(r.postedAt).getTime()) / 86400_000;
      return age >= 7 && age <= 21 && ownIds.has(String(r.threadsPostId)) && !done.has(String(r.threadsPostId));
    })
    .map((r) => ({ threadsPostId: String(r.threadsPostId), impressions: Number(r.imp ?? 0), median }))
    .filter((c) => c.impressions > median)
    .sort((a, b) => b.impressions - a.impressions);
  return cands[0] ?? null;
}

export async function runWeeklyRepostJob(now: Date = new Date()): Promise<{ reposted: number; skipped: string[] }> {
  const skipped: string[] = [];
  let reposted = 0;
  for (const accountId of FEATURE_TRIAL.accountIds) {
    if (!isRepostDay(accountId, now)) continue;
    try {
      const account: any = await db.getThreadsAccountById(accountId);
      if (!account?.isActive || !account.accessToken) { skipped.push(`${accountId}:連携なし`); continue; }
      const target = await pickRepostTarget(accountId);
      if (!target) { skipped.push(`${accountId}:当たりなし`); continue; }
      const res = await fetch(`${THREADS_GRAPH_URL}/${target.threadsPostId}/repost?access_token=${encodeURIComponent(account.accessToken)}`, { method: "POST" });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || !body?.id) {
        skipped.push(`${accountId}:失敗 ${JSON.stringify(body).slice(0, 120)}`);
        console.warn(`[Repost] account=${accountId} 再投稿に失敗: ${JSON.stringify(body).slice(0, 200)}`);
        continue;
      }
      // 記録（同じ投稿を二度と再投稿しないため・効果を測るため）。元の投稿と同じ店舗情報に付けて、公開済みで残す。
      //   quotePostId に元の投稿を入れる＝本数の数え方・分析からは自動で外れる（db.ts の quotePostId IS NULL 条件）。
      //   publishedThreadsPostId は入れない（再投稿の器にはインサイトが無く、分析の取得で失敗するため）。
      try {
        const database = await db.getDb();
        const src: any = (((await database!.execute(sql`
          SELECT projectId FROM scheduledPosts WHERE publishedThreadsPostId = ${target.threadsPostId} LIMIT 1`)) as any)[0] ?? [])[0];
        if (src?.projectId) {
          await db.createScheduledPost({
            userId: account.userId, projectId: src.projectId, threadsAccountId: accountId,
            scheduledAt: now, postedAt: now, postContent: `（再投稿）${target.threadsPostId} → ${body.id}`, status: "posted",
            source: "auto", angle: "repost", quotePostId: target.threadsPostId,
          } as any);
        }
      } catch (e: any) { console.warn(`[Repost] 記録に失敗 account=${accountId}: ${e?.message}`); }
      reposted++;
      console.log(`[Repost] account=${accountId} ${target.threadsPostId} を再投稿（閲覧${target.impressions}・普段${target.median}）`);
    } catch (e) {
      skipped.push(`${accountId}:${(e as Error)?.message?.slice(0, 80)}`);
    }
  }
  return { reposted, skipped };
}

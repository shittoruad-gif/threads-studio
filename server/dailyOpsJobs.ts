/**
 * 日次運用ジョブ2本（jobRunner管理・起動時キャッチアップ対応）
 *
 * ① analytics_snapshot（毎日 7:00 JST = 22:00 UTC）
 *    全ユーザーのThreadsインサイトを自動取得して postAnalytics を更新し、
 *    フォロワー数を日次スナップショット、平均超えのヒット投稿を
 *    全ユーザー横断アーカイブ（hitPostArchive）へ保存する。
 *    → 先生が何もしなくても「成果の見える化」データが毎日たまる。
 *
 * ② approval_reminder（毎日 8:00 JST = 23:00 UTC）
 *    予定時刻を過ぎた「承認待ち」投稿を持つユーザーへメールでリマインドし、
 *    投稿時刻を翌日の同時刻へスライドする（承認した瞬間に意味のある時刻で
 *    投稿されるように）。承認忘れで自動投稿が黙って止まる事故を防ぐ。
 */
import cron from "node-cron";
import {
  getAllUsers,
  getThreadsAccountsByUserId,
  getUserProjects,
  getUserById,
  upsertPostAnalytics,
  upsertFollowerSnapshot,
  upsertHitPostArchive,
  getPostAnalyticsWithEngagement,
  getOverdueAwaitingApprovalPosts,
  updateScheduledPostTime,
} from "./db";
import { sendEmail } from "./_core/notification";

/** JSTの 'YYYY-MM-DD' を返す */
function jstDateString(d: Date = new Date()): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/**
 * 1ユーザー分のインサイト取得＋postAnalytics更新。
 * stats.fetchAndStoreAnalytics（手動ボタン）と同じ処理を共通化。
 */
export async function fetchAndStoreAnalyticsForUser(userId: number): Promise<number> {
  const { getThreadsUserPosts, getThreadsPostInsights } = await import("./threadsApi");
  const accounts = await getThreadsAccountsByUserId(userId);
  let totalFetched = 0;
  for (const account of accounts) {
    const posts = await getThreadsUserPosts(account.accessToken, account.threadsUserId, 25);
    for (const post of posts) {
      const insights = await getThreadsPostInsights(account.accessToken, post.id);
      await upsertPostAnalytics({
        userId,
        threadsPostId: post.id,
        postContent: post.text || null,
        postPermalink: post.permalink || null,
        postedAt: post.timestamp ? new Date(post.timestamp) : null,
        impressions: insights.views,
        likes: insights.likes,
        replies: insights.replies,
        reposts: insights.reposts,
        fetchedAt: new Date(),
      });
      totalFetched++;
    }
  }
  return totalFetched;
}

/** 1ユーザー分のフォロワー数スナップショット */
async function snapshotFollowersForUser(userId: number): Promise<void> {
  const { getThreadsUserCounts } = await import("./threadsApi");
  const accounts = await getThreadsAccountsByUserId(userId);
  const today = jstDateString();
  for (const account of accounts) {
    try {
      const counts = await getThreadsUserCounts(account.accessToken, account.threadsUserId);
      // API未対応等で0が返るときは、連携時に保存済みの値をフォールバックに使う
      const followers = counts.followersCount > 0
        ? counts.followersCount
        : (account.followersCount ?? 0);
      if (followers <= 0) continue; // 0しか取れないアカウントは記録しない（グラフを汚さない）
      await upsertFollowerSnapshot({
        userId,
        threadsAccountId: account.id,
        followersCount: followers,
        capturedOn: today,
      });
    } catch (e) {
      console.error(`[DailyOps] フォロワー取得失敗 user=${userId} account=${account.id}:`, e);
    }
  }
}

/**
 * 1ユーザー分のヒット投稿を全体アーカイブへ。
 * ヒット判定＝既存のstats.hitPostsと同じ「平均エンゲージメント超え」
 * ＋ノイズ対策（投稿5本以上・エンゲージメント10以上）。
 */
async function archiveHitPostsForUser(userId: number): Promise<number> {
  const { posts, avgEngagement } = await getPostAnalyticsWithEngagement(userId);
  if (posts.length < 5) return 0;
  const projects = await getUserProjects(userId);
  const businessType = projects?.[0]?.businessType ?? null;
  let archived = 0;
  for (const p of posts) {
    if (p.engagement <= avgEngagement || p.engagement < 10) continue;
    await upsertHitPostArchive({
      userId,
      threadsPostId: p.threadsPostId,
      businessType,
      postContent: p.postContent,
      impressions: p.impressions,
      likes: p.likes,
      replies: p.replies,
      reposts: p.reposts,
      engagement: p.engagement,
      postedAt: p.postedAt,
    });
    archived++;
  }
  return archived;
}

/** ① 日次アナリティクス収集ジョブ本体 */
export async function runAnalyticsSnapshotJob(): Promise<void> {
  const users = await getAllUsers();
  let processed = 0, fetched = 0, archivedTotal = 0;
  for (const user of users) {
    try {
      const accounts = await getThreadsAccountsByUserId(user.id);
      if (!accounts || accounts.length === 0) continue;
      processed++;
      fetched += await fetchAndStoreAnalyticsForUser(user.id);
      await snapshotFollowersForUser(user.id);
      archivedTotal += await archiveHitPostsForUser(user.id);
    } catch (e) {
      console.error(`[DailyOps] analytics失敗 user=${user.id}:`, e);
    }
  }
  console.log(`[DailyOps] analytics_snapshot完了: ${processed}ユーザー / インサイト${fetched}件 / ヒット投稿アーカイブ${archivedTotal}件`);
}

/** ② 承認待ち放置防止ジョブ本体 */
export async function runApprovalReminderJob(): Promise<void> {
  const overdue = await getOverdueAwaitingApprovalPosts();
  if (overdue.length === 0) {
    console.log("[DailyOps] 期限切れの承認待ちなし");
    return;
  }

  // ユーザーごとにまとめる
  const byUser = new Map<number, typeof overdue>();
  for (const post of overdue) {
    const list = byUser.get(post.userId) ?? [];
    list.push(post);
    byUser.set(post.userId, list);
  }

  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  for (const [userId, posts] of Array.from(byUser.entries())) {
    try {
      // 投稿時刻を「翌日の同時刻」へスライド（承認後に過去時刻で即投稿になるのを防ぐ）
      for (const post of posts) {
        if (!post.scheduledAt) continue;
        const next = new Date(post.scheduledAt);
        while (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
        await updateScheduledPostTime(post.id, next);
      }
      const user = await getUserById(userId);
      if (!user?.email) continue;
      await sendEmail({
        to: user.email,
        subject: `【Threads Studio】承認待ちの投稿が ${posts.length} 件あります`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2>承認待ちの投稿があります</h2>
          <p>自動作成された投稿 <strong>${posts.length}件</strong> が、承認されないまま予定時刻を過ぎていました。</p>
          <p>投稿時刻は翌日に自動調整しました。内容をご確認のうえ、承認すると投稿されます（不要な投稿はキャンセルできます）。</p>
          <a href="${base}/post-history?status=awaiting_approval" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">承認待ちを確認する</a>
          <p style="color:#9ca3af;font-size:12px;">承認モードをオフにすると、確認なしで自動投稿されるようになります（設定ページ）。</p>
        </div>`,
      });
      console.log(`[DailyOps] 承認リマインド送信: user=${userId} ${posts.length}件`);
    } catch (e) {
      console.error(`[DailyOps] 承認リマインド失敗 user=${userId}:`, e);
    }
  }
}

/** スケジューラ初期化（_core/index.tsから呼ぶ） */
export function initDailyOpsSchedulers(): void {
  // 7:00 JST = 22:00 UTC
  cron.schedule("0 22 * * *", async () => {
    const { runTrackedJob } = await import("./jobRunner");
    await runTrackedJob("analytics_snapshot", runAnalyticsSnapshotJob);
  });
  // 8:00 JST = 23:00 UTC
  cron.schedule("0 23 * * *", async () => {
    const { runTrackedJob } = await import("./jobRunner");
    await runTrackedJob("approval_reminder", runApprovalReminderJob);
  });
  console.log("[DailyOps] Schedulers initialized (analytics 7:00 JST / approval 8:00 JST)");
}

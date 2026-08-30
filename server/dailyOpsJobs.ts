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
  updateUserLastCommentCheck,
} from "./db";
import { sendEmail } from "./_core/notification";
import { sendApprovalDigestEmail } from "./approvalEmail";

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
    // アカウント単位で隔離：1アカウントのトークン失効等が他アカウントや
    // 後続処理（フォロワー記録・ヒット投稿アーカイブ）を巻き込まないようにする。
    let posts: Awaited<ReturnType<typeof getThreadsUserPosts>>;
    try {
      posts = await getThreadsUserPosts(account.accessToken, account.threadsUserId, 25);
    } catch (e) {
      console.error(`[DailyOps] 投稿一覧取得失敗 user=${userId} account=${account.id}:`, e);
      continue;
    }
    for (const post of posts) {
      // 投稿単位でも隔離：1投稿のインサイト取得失敗で残りを落とさない。
      try {
        const insights = await getThreadsPostInsights(account.accessToken, post.id);
        await upsertPostAnalytics({
          userId,
          threadsAccountId: account.id,
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
      } catch (e) {
        console.error(`[DailyOps] インサイト取得失敗 user=${userId} post=${post.id}:`, e);
      }
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

  for (const [userId, posts] of Array.from(byUser.entries())) {
    try {
      // 投稿時刻を「翌日の同時刻」へスライド（承認後に過去時刻で即投稿になるのを防ぐ）
      for (const post of posts) {
        if (!post.scheduledAt) continue;
        const next = new Date(post.scheduledAt);
        while (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
        await updateScheduledPostTime(post.id, next);
        // メールに載せる時刻がスライド前のままにならないよう手元も更新する
        post.scheduledAt = next;
      }
      const user = await getUserById(userId);
      if (!user?.email) continue;
      // メール内で本文を読み、その場で承認できる形に（放置による投稿ゼロを防ぐ）
      await sendApprovalDigestEmail({
        to: user.email,
        userId,
        posts: posts.map((p) => ({ id: p.id, postContent: p.postContent, scheduledAt: p.scheduledAt })),
        overdue: true,
      });
      console.log(`[DailyOps] 承認リマインド送信: user=${userId} ${posts.length}件`);
    } catch (e) {
      console.error(`[DailyOps] 承認リマインド失敗 user=${userId}:`, e);
    }
  }
}

/**
 * ③ コメント即応通知ジョブ本体（3時間おき）
 *
 * Threadsは「コメントへの返信が早いほど投稿が伸びる」仕組みのため、
 * 新着コメントに気づかず放置するのが一番もったいない。
 * 新着があれば本人へメールで知らせ、コメント管理ページ（AI返信つき）へ誘導する。
 */
export async function runCommentWatchJob(): Promise<void> {
  const { getThreadsComments } = await import("./threadsApi");
  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  const users = await getAllUsers();
  let notified = 0;

  for (const u of users) {
    try {
      const accounts = await getThreadsAccountsByUserId(u.id);
      if (!accounts || accounts.length === 0) continue;
      const fullUser = await getUserById(u.id);
      if (!fullUser?.email) continue;

      // 前回確認以降のコメントだけを対象（初回は直近24時間）
      const since = fullUser.lastCommentCheckAt
        ? new Date(fullUser.lastCommentCheckAt)
        : new Date(Date.now() - 24 * 60 * 60 * 1000);

      const newComments: { text: string; username?: string; parent?: string }[] = [];
      for (const account of accounts) {
        try {
          const comments = await getThreadsComments(account.accessToken, account.threadsUserId, 30);
          for (const c of comments) {
            // 自分の返信・確認済み分は除外
            if (c.username && c.username === account.threadsUsername) continue;
            if (!c.timestamp || new Date(c.timestamp) <= since) continue;
            newComments.push({
              text: c.text,
              username: c.username,
              parent: c.parent_post_text ?? undefined,
            });
          }
        } catch (e) {
          console.error(`[CommentWatch] 取得失敗 user=${u.id} account=${account.id}:`, e);
        }
      }

      // 確認時刻は毎回更新（通知の重複防止）
      await updateUserLastCommentCheck(u.id, new Date());

      if (newComments.length === 0) continue;

      const previews = newComments.slice(0, 3).map((c) => `
        <div style="border-left:3px solid #10b981;padding:8px 12px;margin:8px 0;background:#f0fdf4;border-radius:0 8px 8px 0;">
          <p style="margin:0;font-size:14px;color:#111;">${(c.username ? '@' + c.username + '：' : '') + (c.text || '').slice(0, 120).replace(/</g, '&lt;')}</p>
          ${c.parent ? `<p style="margin:4px 0 0;font-size:11px;color:#6b7280;">（あなたの投稿「${c.parent.slice(0, 40).replace(/</g, '&lt;')}…」へのコメント）</p>` : ''}
        </div>`).join('');

      await sendEmail({
        to: fullUser.email,
        subject: `【Threads Studio】あなたの投稿にコメントが${newComments.length}件届いています`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2>コメントが届いています 🎉</h2>
          <p>あなたの投稿に新しいコメントが <strong>${newComments.length}件</strong> 届きました。</p>
          ${previews}
          <p style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:13px;">
            💡 <strong>返信が早いほど、投稿はもっと多くの人に表示されます。</strong><br/>
            返信の文章はAIが作ってくれるので、確認して送るだけでOKです。
          </p>
          <a href="${base}/comment-manager" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:12px 0;">AIで返信を作る</a>
        </div>`,
      });
      notified++;

      // LINE連携済みならLINEにも1通（本文プレビュー最大3件＋管理画面リンク）
      if ((fullUser as any)?.lineUserId) {
        try {
          const { sendCommentPush } = await import('./lineNotify');
          await sendCommentPush(
            (fullUser as any).lineUserId,
            newComments.length,
            newComments.slice(0, 3).map((c) => (c.username ? '@' + c.username + '：' : '') + (c.text || '')),
            `${base}/comment-manager`,
          );
        } catch (e) {
          console.error(`[CommentWatch] LINE通知失敗 user=${u.id}:`, e);
        }
      }
    } catch (e) {
      console.error(`[CommentWatch] 処理エラー user=${u.id}:`, e);
    }
  }
  console.log(`[CommentWatch] 完了: ${notified}ユーザーに新着コメント通知`);
}

/**
 * 代理店解約の引き継ぎ猶予が切れたクライアントを停止する。
 * 猶予中（takeoverPendingAt から TAKEOVER_GRACE_DAYS 以内）は何もしない。
 */
export async function runTakeoverExpiryJob(): Promise<void> {
  const { listTakeoverPendingClients, stopTakeoverClient } = await import("./db");
  const { takeoverExpired } = await import("../shared/takeover");
  const pending = await listTakeoverPendingClients();
  const now = new Date();
  const stopped: string[] = [];
  for (const c of pending) {
    if (!c.takeoverPendingAt || !takeoverExpired(c.takeoverPendingAt, now)) continue;
    try {
      await stopTakeoverClient(c.id);
      stopped.push(`${c.storeName || c.name || ''} <${c.email}>`);
    } catch (e) {
      console.error(`[TakeoverExpiry] 停止失敗 user=${c.id}:`, e);
    }
  }
  if (stopped.length > 0) {
    console.log(`[TakeoverExpiry] 猶予切れ${stopped.length}件を停止`);
    const { notifyOwner } = await import("./_core/notification");
    await notifyOwner({
      title: `引き継ぎ猶予切れ: クライアント${stopped.length}件を停止しました`,
      content: stopped.map((s) => `・${s}`).join("\n"),
    });
  }
}

/** スケジューラ初期化（_core/index.tsから呼ぶ） */
export function initDailyOpsSchedulers(): void {
  // 7:00 JST = 22:00 UTC
  cron.schedule("0 22 * * *", async () => {
    const { runTrackedJob } = await import("./jobRunner");
    await runTrackedJob("analytics_snapshot", runAnalyticsSnapshotJob);
  });
  // 7:10 JST = 22:10 UTC — 代理店解約の引き継ぎ猶予切れチェック
  cron.schedule("10 22 * * *", async () => {
    const { runTrackedJob } = await import("./jobRunner");
    await runTrackedJob("takeover_expiry", runTakeoverExpiryJob);
  });
  // 8:00 JST = 23:00 UTC
  cron.schedule("0 23 * * *", async () => {
    const { runTrackedJob } = await import("./jobRunner");
    await runTrackedJob("approval_reminder", runApprovalReminderJob);
  });
  // コメント即応：3時間おき（8〜23時JSTのみ＝深夜は通知しない）。
  // 高頻度ジョブなので起動時キャッチアップの対象外（次の回がすぐ来るため。
  // jobRunnerのレジストリには登録しない）。失敗通報はrunTrackedJobが担う。
  cron.schedule("20 23,2,5,8,11 * * *", async () => {
    const { runTrackedJob } = await import("./jobRunner");
    await runTrackedJob("comment_watch", runCommentWatchJob);
  });
  console.log("[DailyOps] Schedulers initialized (analytics 7:00 / approval 8:00 / comments 8:20-20:20 JST)");
}

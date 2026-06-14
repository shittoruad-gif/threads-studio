/**
 * Scheduled Post Executor
 *
 * Automatically executes scheduled posts at the specified time
 */

import * as db from "./db";
import { createAndPublishThread, splitThreadSegments } from "./threadsPost";
import { notifyOwner, sendEmail } from "./_core/notification";
import { refreshAccessToken } from "./threadsAuth";

const APP_BASE_URL = process.env.APP_BASE_URL || "https://threads-studio.com";

/**
 * 投稿失敗をユーザーへメール通知（欠点#5の解消）。
 * これがないと自動投稿が静かに失敗し、ユーザーは履歴を見ない限り気づけない。
 * ベストエフォート（送信失敗は握りつぶす）。
 */
async function notifyUserPostFailure(userId: number, errorMessage: string): Promise<void> {
  try {
    const user = await db.getUserById(userId);
    if (!user?.email) return;
    await sendEmail({
      to: user.email,
      subject: "【Threads Studio】投稿の公開に失敗しました",
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>投稿の公開に失敗しました</h2>
        <p>予約・自動投稿のThreadsへの公開に失敗しました。</p>
        <p style="color:#666;font-size:13px;">理由: ${errorMessage}</p>
        <p>Threads連携の有効期限切れや一時的なエラーが原因のことが多いです。ダッシュボードからご確認ください。</p>
        <a href="${APP_BASE_URL}/post-history?status=failed" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">投稿履歴を確認</a>
      </div>`,
    });
  } catch (err: any) {
    console.error(`[Scheduled Post] Failed to notify user ${userId}:`, err?.message);
  }
}

const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Reset stuck processing posts back to pending
 */
async function resetStuckProcessingPosts() {
  try {
    const stuckPosts = await db.getStuckProcessingPosts(PROCESSING_TIMEOUT_MS);
    for (const post of stuckPosts) {
      await db.updateScheduledPost(post.id, { status: 'pending' });
      console.log(`[Scheduled Post] Reset stuck post ${post.id} from processing to pending`);
    }
  } catch (error) {
    console.error('[Scheduled Post] Error resetting stuck posts:', error);
  }
}

/**
 * Execute pending scheduled posts
 */
export async function executePendingPosts() {
  const now = new Date();

  try {
    // Reset posts stuck in processing state
    await resetStuckProcessingPosts();

    // Get all pending posts that are due
    const posts = await db.getPendingScheduledPosts();

    if (!posts || posts.length === 0) {
      return { executed: 0, failed: 0 };
    }

    let executed = 0;
    let failed = 0;

    for (const post of posts) {
      try {
        // ★#3 アトミック CAS で処理権を取得（他のワーカーと競合した場合は false）。
        //   失敗（既に他で処理済み）ならこの投稿はスキップ → 二重送信を防止。
        const claimed = await db.claimScheduledPost(post.id);
        if (!claimed) {
          console.log(`[Scheduled Post] Post ${post.id} already claimed by another worker, skipping`);
          continue;
        }

        // Get Threads account
        const account = await db.getThreadsAccountById(post.threadsAccountId);

        if (!account) {
          await db.updateScheduledPost(post.id, {
            status: 'failed',
            errorMessage: 'Threads account not found'
          });
          failed++;
          continue;
        }

        // Check token expiration and attempt refresh if expiring soon (within 24 hours)
        let accessToken = account.accessToken;
        const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt) : null;

        if (expiresAt) {
          const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);

          if (hoursUntilExpiry <= 0) {
            // Token already expired - attempt refresh
            try {
              const refreshed = await refreshAccessToken(account.accessToken);
              if (refreshed) {
                accessToken = refreshed.access_token;
                // ★#5 リフレッシュしたトークンを必ず DB にも保存する。
                //   これがないと毎回失効トークンで refresh しに行く無限ループになる。
                await db.updateThreadsAccountToken(
                  account.id,
                  refreshed.access_token,
                  refreshed.expires_in,
                );
                console.log(`[Scheduled Post] Refreshed expired token for account ${account.id} (persisted)`);
              } else {
                await db.updateScheduledPost(post.id, {
                  status: 'failed',
                  errorMessage: 'Access token expired and refresh failed'
                });
                failed++;
                continue;
              }
            } catch {
              await db.updateScheduledPost(post.id, {
                status: 'failed',
                errorMessage: 'Access token expired and refresh failed'
              });
              failed++;
              continue;
            }
          } else if (hoursUntilExpiry <= 24) {
            // Token expiring soon - refresh proactively
            try {
              const refreshed = await refreshAccessToken(account.accessToken);
              if (refreshed) {
                accessToken = refreshed.access_token;
                // ★#5 同上：DB にも保存
                await db.updateThreadsAccountToken(
                  account.id,
                  refreshed.access_token,
                  refreshed.expires_in,
                );
                console.log(`[Scheduled Post] Proactively refreshed token for account ${account.id} (persisted)`);
              }
            } catch {
              // Continue with existing token if refresh fails
            }
          }
        }

        // Post to Threads
        // ★ツリー（続きの投稿）は本物の返信チェーンとして連続投稿する。
        //   postContent が区切りを含めば複数投稿に分割、無ければ単一投稿。
        //   各セグメントは個別投稿なので500字制限による切り捨ては起きない。
        const segments = splitThreadSegments(post.postContent || '');
        const result = await createAndPublishThread(
          { accessToken, threadsUserId: account.threadsUserId },
          segments,
        );

        // Update status to posted
        await db.updateScheduledPost(post.id, {
          status: 'posted',
          postedAt: now,
        });

        executed++;
        console.log(`[Scheduled Post] Successfully published post ${post.id} to Threads (${result.id})`);

      } catch (error) {
        console.error(`[Scheduled Post] Failed to publish post ${post.id}:`, error);

        await db.updateScheduledPost(post.id, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });

        failed++;

        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        // Notify owner about failed post
        await notifyOwner({
          title: '予約投稿の実行に失敗しました',
          content: `投稿ID: ${post.id}\nエラー: ${errMsg}`
        });
        // ★ユーザー本人にも通知（無音失敗を防ぐ）
        await notifyUserPostFailure(post.userId, errMsg);
      }
    }

    if (executed > 0 || failed > 0) {
      console.log(`[Scheduled Post] Execution complete: ${executed} succeeded, ${failed} failed`);
    }

    return { executed, failed };

  } catch (error) {
    console.error('[Scheduled Post Executor] Error:', error);
    return { executed: 0, failed: 0 };
  }
}

/**
 * Start scheduled post executor
 * Runs every minute to check for pending posts
 */
export function startScheduledPostExecutor() {
  console.log('[Scheduled Post Executor] Starting...');

  // Run immediately
  executePendingPosts();

  // Run every minute
  const interval = setInterval(() => {
    executePendingPosts();
  }, 60 * 1000);

  return () => {
    clearInterval(interval);
    console.log('[Scheduled Post Executor] Stopped');
  };
}

/**
 * Scheduled Post Executor
 *
 * Automatically executes scheduled posts at the specified time
 */

import * as db from "./db";
import { createAndPublishPost } from "./threadsPost";
import { notifyOwner } from "./_core/notification";
import { refreshAccessToken } from "./threadsAuth";

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
        // Mark as processing to prevent duplicate execution
        await db.updateScheduledPost(post.id, { status: 'processing' });

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
                console.log(`[Scheduled Post] Refreshed expired token for account ${account.id}`);
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
                console.log(`[Scheduled Post] Proactively refreshed token for account ${account.id}`);
              }
            } catch {
              // Continue with existing token if refresh fails
            }
          }
        }

        // Post to Threads
        const result = await createAndPublishPost({
          accessToken,
          threadsUserId: account.threadsUserId,
          text: post.postContent || '',
          mediaType: "TEXT",
        });

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

        // Notify owner about failed post
        await notifyOwner({
          title: '予約投稿の実行に失敗しました',
          content: `投稿ID: ${post.id}\nエラー: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
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

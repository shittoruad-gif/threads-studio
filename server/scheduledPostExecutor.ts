/**
 * Scheduled Post Executor
 * 
 * Automatically executes scheduled posts at the specified time
 */

import * as db from "./db";
import { createAndPublishPost } from "./threadsPost";
import { notifyOwner } from "./_core/notification";

/**
 * Execute pending scheduled posts
 */
export async function executePendingPosts() {
  const now = new Date();
  
  try {
    // Get all pending posts that are due
    const posts = await db.getPendingScheduledPosts();
    
    if (!posts || posts.length === 0) {
      return { executed: 0, failed: 0 };
    }

    let executed = 0;
    let failed = 0;

    for (const post of posts) {
      try {
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

        // Check token expiration
        if (account.tokenExpiresAt && new Date(account.tokenExpiresAt) < now) {
          await db.updateScheduledPost(post.id, { 
            status: 'failed',
            errorMessage: 'Access token expired'
          });
          failed++;
          continue;
        }

        // Post to Threads
        const result = await createAndPublishPost({
          accessToken: account.accessToken,
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

    console.log(`[Scheduled Post] Execution complete: ${executed} succeeded, ${failed} failed`);
    
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
  }, 60 * 1000); // 60 seconds

  return () => {
    clearInterval(interval);
    console.log('[Scheduled Post Executor] Stopped');
  };
}

import cron from 'node-cron';
import { withDbRetry } from './db';
import { scheduledPosts } from '../drizzle/schema';
import { and, eq, lte } from 'drizzle-orm';

/**
 * 予約投稿スケジューラー
 * 毎分実行され、投稿予定時刻を過ぎた予約投稿を処理する
 */
export function startScheduler() {
  // 毎分実行（cron形式: 秒 分 時 日 月 曜日）
  cron.schedule('* * * * *', async () => {
    try {
      await processScheduledPosts();
    } catch (error) {
      console.error('[Scheduler] Error processing scheduled posts:', error);
    }
  });

  console.log('[Scheduler] Started - checking every minute for scheduled posts');
}

/**
 * 予約投稿を処理する
 * 現在時刻を過ぎた「pending」ステータスの投稿を「posted」に更新
 * DB接続エラー時は自動リトライ（最大3回、指数バックオフ）
 */
async function processScheduledPosts() {
  const now = new Date();

  try {
    // 投稿予定時刻を過ぎた pending 状態の投稿を取得（リトライ付き）
    const pendingPosts = await withDbRetry((db) =>
      db
        .select()
        .from(scheduledPosts)
        .where(
          and(
            eq(scheduledPosts.status, 'pending'),
            lte(scheduledPosts.scheduledAt, now)
          )
        )
    );

    if (pendingPosts.length === 0) {
      return; // 処理対象なし
    }

    console.log(`[Scheduler] Processing ${pendingPosts.length} scheduled post(s)`);

    // 各投稿を処理
    for (const post of pendingPosts) {
      try {
        // モックAPI: 実際のThreads投稿は行わず、ステータスのみ更新（リトライ付き）
        await withDbRetry((db) =>
          db
            .update(scheduledPosts)
            .set({
              status: 'posted',
              postedAt: now,
              updatedAt: now,
            })
            .where(eq(scheduledPosts.id, post.id))
        );

        console.log(`[Scheduler] Posted scheduled post ID: ${post.id} (Mock)`);
        
        // TODO: 実際のThreads APIに切り替える場合は、ここでAPI呼び出しを行う
      } catch (error) {
        console.error(`[Scheduler] Failed to post scheduled post ID: ${post.id}`, error);
        
        // エラーの場合はステータスを「failed」に更新（リトライ付き）
        try {
          await withDbRetry((db) =>
            db
              .update(scheduledPosts)
              .set({
                status: 'failed',
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                updatedAt: now,
              })
              .where(eq(scheduledPosts.id, post.id))
          );
        } catch (updateError) {
          console.error(`[Scheduler] Failed to update error status for post ID: ${post.id}`, updateError);
        }
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error querying scheduled posts:', error);
  }
}

/**
 * スケジューラーを停止する（テスト用）
 */
export function stopScheduler() {
  cron.getTasks().forEach((task) => task.stop());
  console.log('[Scheduler] Stopped');
}

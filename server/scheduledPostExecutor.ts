/**
 * Scheduled Post Executor
 *
 * Automatically executes scheduled posts at the specified time
 */

import * as db from "./db";
import { createAndPublishThread, splitThreadSegments, PartialThreadError } from "./threadsPost";
import { notifyOwner, sendEmail } from "./_core/notification";
import { refreshAccessToken } from "./threadsAuth";
import { toPublicErrorMessage, escapeHtml } from "../shared/sanitize";

const APP_BASE_URL = process.env.APP_BASE_URL || "https://threads-studio.com";

/**
 * 投稿失敗をユーザーへメール通知（欠点#5の解消）。
 * これがないと自動投稿が静かに失敗し、ユーザーは履歴を見ない限り気づけない。
 * ベストエフォート（送信失敗は握りつぶす）。
 */
type FailureKind = 'failed' | 'reauth' | 'partial';

async function notifyUserPostFailure(
  userId: number,
  errorMessage: string,
  kind: FailureKind = 'failed',
): Promise<void> {
  try {
    const user = await db.getUserById(userId);
    if (!user?.email) return;

    let subject: string;
    let heading: string;
    let body: string;
    let cta: { label: string; href: string };

    if (kind === 'reauth') {
      // トークン失効・更新失敗：再連携しないと自動投稿が止まり続ける
      subject = "【Threads Studio】Threads連携が切れ、投稿が公開できませんでした（再連携のお願い）";
      heading = "Threads連携が切れています";
      body = `予約・自動投稿をThreadsに公開できませんでした。Threads連携の有効期限切れ、またはThreads側で連携が解除された可能性があります。<br>このままだと<strong>以降の自動投稿も停止</strong>します。お手数ですが再連携をお願いします。`;
      cta = { label: "再連携する", href: `${APP_BASE_URL}/threads-connect` };
    } else if (kind === 'partial') {
      // 連続投稿の部分成功：メインは公開済み。再投稿は不要（二重投稿防止）
      subject = "【Threads Studio】連続投稿の一部が公開されませんでした";
      heading = "連続投稿の続きが一部公開されませんでした";
      body = `メイン（1件目）の投稿は<strong>正常に公開されています</strong>が、続き（2件目以降）の一部が公開できませんでした。<br><strong>同じ投稿を作り直して再投稿しないでください</strong>（メインが二重に投稿されます）。続きを足したい場合は、Threads上で該当投稿に手動で返信する形をおすすめします。`;
      cta = { label: "投稿履歴を確認", href: `${APP_BASE_URL}/post-history` };
    } else {
      subject = "【Threads Studio】投稿の公開に失敗しました";
      heading = "投稿の公開に失敗しました";
      body = `予約・自動投稿のThreadsへの公開に失敗しました。一時的なエラーのことが多いです。ダッシュボードからご確認ください。`;
      cta = { label: "投稿履歴を確認", href: `${APP_BASE_URL}/post-history?status=failed` };
    }

    // 生のAPIエラー（コード番号・JSON）をそのまま見せず、行動できる日本語文言に変換する。
    // 元のエラーは呼び出し側の console.error / notifyOwner に残る（運用追跡用）。
    const friendlyDetail = escapeHtml(toPublicErrorMessage(errorMessage));

    await sendEmail({
      to: user.email,
      subject,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>${heading}</h2>
        <p>${body}</p>
        <p style="color:#666;font-size:13px;">詳細: ${friendlyDetail}</p>
        <a href="${cta.href}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">${cta.label}</a>
      </div>`,
    });
  } catch (err: any) {
    console.error(`[Scheduled Post] Failed to notify user ${userId}:`, err?.message);
  }
}

// 「処理中」のまま放置された投稿を pending に戻すまでの猶予。
// 連続投稿(ツリー)はセグメント間に遅延＋トークン更新で時間がかかるため、
// 実際の処理時間より十分長く取り、処理中の投稿を誤って再投入して二重投稿になる
// レースを避ける。
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

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
          // 連携アカウントが見つからない＝連携が外れている。再連携を促す。
          await notifyUserPostFailure(post.userId, 'Threads連携が見つかりませんでした', 'reauth');
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
                // ★無音失敗を防ぐ：トークン失効＋更新失敗は再連携が必要
                await notifyUserPostFailure(post.userId, 'アクセストークンが失効し、自動更新にも失敗しました', 'reauth');
                continue;
              }
            } catch {
              await db.updateScheduledPost(post.id, {
                status: 'failed',
                errorMessage: 'Access token expired and refresh failed'
              });
              failed++;
              // ★無音失敗を防ぐ：トークン失効＋更新失敗は再連携が必要
              await notifyUserPostFailure(post.userId, 'アクセストークンが失効し、自動更新にも失敗しました', 'reauth');
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

        // ユーザー設定（トピックタグ・追い投稿）と店舗情報を取得
        const postUser = await db.getUserById(post.userId);
        const postProject = await db.getProjectById(post.projectId);

        let result: { id: string };
        if ((post as any).replyToThreadsId) {
          // ★追い投稿：新規投稿ではなく、元投稿への「返信」として公開する
          //   （自分の投稿にひとこと足すと、タイムラインで再浮上しやすくなる）
          const { createAndPublishPost } = await import('./threadsPost');
          result = await createAndPublishPost({
            accessToken,
            threadsUserId: account.threadsUserId,
            text: (post.postContent || '').slice(0, 480),
            mediaType: 'TEXT',
            replyToId: (post as any).replyToThreadsId,
          });
        } else {
          // Post to Threads
          // ★ツリー（続きの投稿）は本物の返信チェーンとして連続投稿する。
          //   postContent が区切りを含めば複数投稿に分割、無ければ単一投稿。
          //   各セグメントは個別投稿なので500字制限による切り捨ては起きない。
          const segments = splitThreadSegments(post.postContent || '');
          // トピックタグ（設定ONのとき、店舗情報から1つ。フォロワー外への発見性UP）
          const topicTag = postUser?.autoTopicTag !== false && postProject
            ? (await import('./reachBoost')).deriveTopicTag(postProject) ?? undefined
            : undefined;
          result = await createAndPublishThread(
            { accessToken, threadsUserId: account.threadsUserId, topicTag },
            segments,
          );
        }

        // Update status to posted
        await db.updateScheduledPost(post.id, {
          status: 'posted',
          postedAt: now,
          // 実績学習用：どの切り口の投稿がどれだけ見られたかを後から突き合わせる
          publishedThreadsPostId: result.id,
        });

        executed++;
        console.log(`[Scheduled Post] Successfully published post ${post.id} to Threads (${result.id})`);

        // ★流入計測コメント：自動投稿のメイン公開直後に、自分の投稿へ1件だけ返信し、
        //   お問い合わせキーワードを案内する。
        //   - キーワードは自然な一言をローテーション（数字コードは違和感があるため不使用）。
        //     同日の3投稿は連番IDのため必ず別の言葉になり、「言葉×日付」で
        //     どの投稿から何人来たかをLINE受信箱から判別できる。
        //   - 各キーワードにはLINE側（Keiro）の部分一致自動応答を用意しておくこと。
        if (post.source === 'auto' && !(post as any).replyToThreadsId) {
          try {
            const { inquiryKeywordForPost } = await import('../shared/inquiryKeywords');
            const inquiryCode = inquiryKeywordForPost(post.id);
            // ★合言葉は業種を問わない言葉のみ（shared/inquiryKeywords.ts）。
            //   店舗が扱っていないメニュー名を案内しないこと。
            //   2行目に合言葉と同じ語を書くと重複して不自然になるため、内容を重ねない。
            const commentText =
              `気になった方は、プロフィールの固定投稿にある公式LINEから「${inquiryCode}」とメッセージしてください😊\n` +
              `そのままトークでご質問にお答えします。`;
            const { createAndPublishPost } = await import('./threadsPost');
            const reply = await createAndPublishPost({
              accessToken,
              threadsUserId: account.threadsUserId,
              text: commentText,
              mediaType: 'TEXT',
              replyToId: result.id,
            });
            console.log(`[Scheduled Post] Inquiry comment posted for post ${post.id} (code=${inquiryCode}, reply=${reply.id})`);
          } catch (e) {
            // コメントは計測用の付加機能。失敗しても本体投稿は成功として扱う。
            console.error(`[Scheduled Post] inquiry comment failed for post ${post.id}:`, e);
          }
        }

        // ★追い投稿の自動作成：自動投稿のメイン投稿が公開できたら、
        //   約6時間後に「ひとこと返信」を予約（設定ONのユーザーのみ）。
        //   承認モードONの人は承認待ちに入れて、勝手に公開しない。
        if (
          post.source === 'auto' &&
          !(post as any).replyToThreadsId &&
          postUser?.autoFollowUpEnabled !== false
        ) {
          try {
            const { buildFollowUpContent, computeFollowUpTime } = await import('./reachBoost');
            await db.createScheduledPost({
              userId: post.userId,
              projectId: post.projectId,
              threadsAccountId: post.threadsAccountId,
              postContent: buildFollowUpContent(postProject?.mainProblem, post.id),
              scheduledAt: computeFollowUpTime(now),
              status: postUser?.autoPostRequireApproval ? 'awaiting_approval' : 'pending',
              source: 'auto',
              replyToThreadsId: result.id,
            } as any);
            console.log(`[Scheduled Post] Follow-up bump scheduled for post ${post.id} (root=${result.id})`);
          } catch (e) {
            console.error(`[Scheduled Post] follow-up creation failed for post ${post.id}:`, e);
          }
        }

      } catch (error) {
        console.error(`[Scheduled Post] Failed to publish post ${post.id}:`, error);

        // ★連続投稿の途中失敗：メイン投稿は公開済みなので「投稿済み(一部欠け)」として扱い、
        //   再試行でメインを二重投稿しないようにする（冪等性 / 欠点#5対策）。
        if (error instanceof PartialThreadError) {
          await db.updateScheduledPost(post.id, {
            status: 'posted',
            postedAt: now,
            publishedThreadsPostId: error.rootId,
            errorMessage: `メイン投稿は公開済みですが、続きの投稿が一部失敗しました（${error.message}）。重複投稿を避けるため再試行は行いません。`,
          });
          executed++;
          console.warn(`[Scheduled Post] Post ${post.id} partially published (root=${error.rootId}).`);
          // ユーザーには「メインは公開済み・続きが一部失敗（再投稿しないで）」を正確に通知
          await notifyUserPostFailure(post.userId, error.message, 'partial');
          continue;
        }

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

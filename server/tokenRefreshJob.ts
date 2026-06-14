/**
 * Threads Token Auto-Refresh Background Job
 * 
 * Periodically checks for tokens expiring within 7 days
 * and automatically refreshes them using the Threads API.
 * Runs every 6 hours.
 */

import { getAccountsWithExpiringTokens, updateThreadsAccountToken, getUserById } from "./db";
import { refreshAccessToken } from "./threadsAuth";
import { sendEmail } from "./_core/notification";

const APP_BASE_URL = process.env.APP_BASE_URL || "https://threads-studio.com";

/**
 * トークン更新に失敗したアカウントの持ち主へ「再連携が必要」と通知する。
 * これがないと、トークン失効・権限剥奪のときに自動投稿が無音で止まり、
 * ユーザーが気づけない（欠点#4の解消）。送信失敗は握りつぶす（ベストエフォート）。
 */
async function notifyTokenRefreshFailure(
  userId: number | null | undefined,
  threadsUsername: string | null,
): Promise<void> {
  try {
    if (!userId) return;
    const user = await getUserById(userId);
    if (!user?.email) return;
    const acc = threadsUsername ? `@${threadsUsername}` : "Threadsアカウント";
    await sendEmail({
      to: user.email,
      subject: "【Threads Studio】Threads連携の更新に失敗しました（再連携のお願い）",
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>Threads連携の更新に失敗しました</h2>
        <p>${acc} のアクセストークンを自動更新できませんでした。</p>
        <p>このままだと<strong>自動投稿が停止</strong>します。お手数ですが、ダッシュボードから再連携をお願いします。</p>
        <a href="${APP_BASE_URL}/threads-connect" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">再連携する</a>
        <p style="color:#666;font-size:13px;">※Threads側で連携を解除した／長期間ログインしていない場合に発生します。</p>
      </div>`,
    });
    console.log(`[TokenRefresh] Sent re-auth notification to user ${userId}`);
  } catch (err: any) {
    console.error(`[TokenRefresh] Failed to send notification to user ${userId}:`, err?.message);
  }
}

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DAYS_BEFORE_EXPIRY = 7; // Refresh tokens expiring within 7 days

interface RefreshResult {
  accountId: number;
  threadsUsername: string | null;
  success: boolean;
  error?: string;
}

/**
 * Refresh a single account's token
 */
export async function refreshSingleAccountToken(
  accountId: number,
  accessToken: string,
  threadsUsername: string | null,
  userId?: number | null,
): Promise<RefreshResult> {
  try {
    const tokenResponse = await refreshAccessToken(accessToken);
    await updateThreadsAccountToken(
      accountId,
      tokenResponse.access_token,
      tokenResponse.expires_in
    );
    console.log(`[TokenRefresh] Successfully refreshed token for @${threadsUsername || accountId}`);
    return { accountId, threadsUsername, success: true };
  } catch (error: any) {
    console.error(`[TokenRefresh] Failed to refresh token for @${threadsUsername || accountId}:`, error.message);
    // ★失敗時はユーザーに再連携を促すメール通知（無音停止を防ぐ）
    await notifyTokenRefreshFailure(userId, threadsUsername);
    return { accountId, threadsUsername, success: false, error: error.message };
  }
}

/**
 * Refresh all tokens that are expiring soon
 */
export async function refreshExpiringTokens(): Promise<RefreshResult[]> {
  console.log(`[TokenRefresh] Checking for tokens expiring within ${DAYS_BEFORE_EXPIRY} days...`);
  
  const expiringAccounts = await getAccountsWithExpiringTokens(DAYS_BEFORE_EXPIRY);
  
  if (expiringAccounts.length === 0) {
    console.log("[TokenRefresh] No tokens need refreshing.");
    return [];
  }

  console.log(`[TokenRefresh] Found ${expiringAccounts.length} account(s) with expiring tokens.`);
  
  const results: RefreshResult[] = [];
  
  for (const account of expiringAccounts) {
    const result = await refreshSingleAccountToken(
      account.id,
      account.accessToken,
      account.threadsUsername,
      (account as any).userId,
    );
    results.push(result);
    
    // Small delay between API calls to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  console.log(`[TokenRefresh] Completed: ${successCount} succeeded, ${failCount} failed.`);
  
  return results;
}

let refreshInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background token refresh job
 */
export function startTokenRefreshJob(): void {
  if (refreshInterval) {
    console.log("[TokenRefresh] Job already running, skipping start.");
    return;
  }

  console.log(`[TokenRefresh] Starting background job (interval: ${REFRESH_INTERVAL_MS / 1000 / 60 / 60}h, threshold: ${DAYS_BEFORE_EXPIRY} days)`);
  
  // Run immediately on startup (with a small delay to let DB connect)
  setTimeout(() => {
    refreshExpiringTokens().catch(err => {
      console.error("[TokenRefresh] Initial run failed:", err.message);
    });
  }, 10000); // 10 second delay after server start

  // Then run periodically
  refreshInterval = setInterval(() => {
    refreshExpiringTokens().catch(err => {
      console.error("[TokenRefresh] Periodic run failed:", err.message);
    });
  }, REFRESH_INTERVAL_MS);
}

/**
 * Stop the background token refresh job
 */
export function stopTokenRefreshJob(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    console.log("[TokenRefresh] Background job stopped.");
  }
}

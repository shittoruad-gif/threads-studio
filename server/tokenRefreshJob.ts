/**
 * Threads Token Auto-Refresh Background Job
 * 
 * Periodically checks for tokens expiring within 7 days
 * and automatically refreshes them using the Threads API.
 * Runs every 6 hours.
 */

import { getAccountsWithExpiringTokens, updateThreadsAccountToken } from "./db";
import { refreshAccessToken } from "./threadsAuth";

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
  threadsUsername: string | null
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
      account.threadsUsername
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

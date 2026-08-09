/**
 * Threads OAuth Authentication Helper
 * 
 * Handles OAuth authentication flow for Threads API
 */

import { ENV } from "./_core/env";

// 2025年以降、Threads は threads.net → threads.com に段階的に移行された。
// authorize は依然 threads.net でも 200 を返すが、内部で www.threads.com/login?next=...
// への 301 が挟まり、next の redirect_uri が二重エンコードされる。シークレット
// モードでは途中でセッション周りが噛み合わず「このページは存在しません」を出す実例あり。
// 直接 www.threads.com/oauth/authorize を叩いてリダイレクトを1段減らす。
const THREADS_OAUTH_URL = "https://www.threads.com/oauth/authorize";
// トークン交換とグラフAPIは Meta 公式ドキュメント通り graph.threads.net を維持。
const THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const THREADS_GRAPH_URL = "https://graph.threads.net/v1.0";

export interface ThreadsAuthConfig {
  redirectUri: string;
  scope?: string[];
}

/**
 * Threadsアプリの資格情報（App ID / Secret）。
 *
 * BYOA（Bring Your Own App）方式：ユーザーが自分で作成したMetaアプリの
 * App ID/Secret を渡すと、その資格情報で認証・トークン交換を行う。
 * 未指定（null/undefined）のときは弊社アプリの ENV.threadsAppId / Secret を使う。
 *
 * これにより、弊社アプリがMeta審査未承認でも、ユーザーは自分のアプリで
 * 自分のThreadsアカウントに対して全権限（審査不要）を使える。
 */
export interface ThreadsAppCreds {
  appId: string;
  appSecret: string;
}

/** creds が無ければ弊社アプリの ENV を返す（既存挙動と互換）。 */
function resolveCreds(creds?: ThreadsAppCreds | null): ThreadsAppCreds {
  if (creds && creds.appId && creds.appSecret) return creds;
  return { appId: ENV.threadsAppId, appSecret: ENV.threadsAppSecret };
}

export interface ThreadsTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export interface ThreadsLongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // 60 days in seconds
}

export interface ThreadsAuthUrlOptions {
  /**
   * When true, forces Threads to show the login screen even if a session exists.
   * Use this when the user wants to connect a DIFFERENT account than the one
   * currently active in their Threads.com session.
   *
   * Implemented by passing `auth_type=reauthenticate` (Facebook OAuth standard)
   * which Threads inherits from Meta's OAuth implementation.
   */
  forceReauth?: boolean;
}

/**
 * Generate OAuth authorization URL
 */
export function getThreadsAuthUrl(config: ThreadsAuthConfig, options: ThreadsAuthUrlOptions = {}, creds?: ThreadsAppCreds | null): string {
  const defaultScopes = [
    "threads_basic",
    "threads_content_publish",
    // 連続投稿（ツリー）の2件目以降とコメント返信は reply_to_id で作成するが、
    // この「返信を作成する」操作には threads_manage_replies 権限が必須
    // （エンドポイントが content_publish と同じでも、返信アクションは別権限）。
    "threads_manage_replies",
    "threads_read_replies",
    // 投稿分析（PostAnalytics）でインサイトAPIを使うため必須
    "threads_manage_insights",
  ];

  // 地域トレンド収集（keyword_search）。Meta審査が「承認された後」だけ要求する。
  // ★未承認のスコープを一般ユーザーの連携リクエストに混ぜると、Threads連携
  //   自体が失敗し、他の審査中権限まで巻き添えになる恐れがあるため、
  //   承認確認まで要求しない（承認後は環境変数を true にするだけで有効化）。
  if (process.env.THREADS_KEYWORD_SEARCH_APPROVED === "true") {
    defaultScopes.push("threads_keyword_search");
  }

  const scopes = config.scope || defaultScopes;

  const params = new URLSearchParams({
    client_id: resolveCreds(creds).appId,
    redirect_uri: config.redirectUri,
    scope: scopes.join(","),
    response_type: "code",
  });

  // Force re-authentication so the user can pick a different Threads account.
  // Without this, Threads silently uses whichever account is logged into the
  // browser, which surprises users who want to connect a second account.
  if (options.forceReauth) {
    params.set("auth_type", "reauthenticate");
  }

  return `${THREADS_OAUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for short-lived access token
 * 
 * Threads API requires POST with form-encoded body
 * https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  creds?: ThreadsAppCreds | null
): Promise<ThreadsTokenResponse> {
  const c = resolveCreds(creds);
  const params = new URLSearchParams({
    client_id: c.appId,
    client_secret: c.appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  console.log('[Threads OAuth] Exchanging code for token...');
  console.log('[Threads OAuth] redirect_uri:', redirectUri);
  console.log('[Threads OAuth] code (first 10 chars):', code.substring(0, 10) + '...');

  // Threads API accepts both query string and POST body
  // Using POST body (application/x-www-form-urlencoded) as per official docs
  const response = await fetch(THREADS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const responseText = await response.text();
  console.log('[Threads OAuth] Token exchange response status:', response.status);
  
  if (!response.ok) {
    console.error('[Threads OAuth] Token exchange failed:', responseText);
    throw new Error(`Failed to exchange code for token: ${responseText}`);
  }

  try {
    const data = JSON.parse(responseText);
    console.log('[Threads OAuth] Token exchange successful, token type:', data.token_type);
    return data;
  } catch (e) {
    console.error('[Threads OAuth] Failed to parse token response:', responseText);
    throw new Error(`Invalid token response format: ${responseText}`);
  }
}

/**
 * Exchange short-lived token for long-lived token (60 days)
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  creds?: ThreadsAppCreds | null
): Promise<ThreadsLongLivedTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_secret: resolveCreds(creds).appSecret,
    access_token: shortLivedToken,
  });

  console.log('[Threads OAuth] Exchanging for long-lived token...');

  const response = await fetch(`${THREADS_GRAPH_URL}/access_token?${params.toString()}`, {
    method: "GET",
  });

  const responseText = await response.text();
  console.log('[Threads OAuth] Long-lived token exchange response status:', response.status);

  if (!response.ok) {
    console.error('[Threads OAuth] Long-lived token exchange failed:', responseText);
    throw new Error(`Failed to exchange for long-lived token: ${responseText}`);
  }

  try {
    const data = JSON.parse(responseText);
    console.log('[Threads OAuth] Long-lived token exchange successful, expires_in:', data.expires_in);
    return data;
  } catch (e) {
    console.error('[Threads OAuth] Failed to parse long-lived token response:', responseText);
    throw new Error(`Invalid long-lived token response format: ${responseText}`);
  }
}

/**
 * Refresh long-lived access token
 */
export async function refreshAccessToken(
  accessToken: string
): Promise<ThreadsLongLivedTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "th_refresh_token",
    access_token: accessToken,
  });

  const response = await fetch(`${THREADS_GRAPH_URL}/refresh_access_token?${params.toString()}`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh access token: ${error}`);
  }

  return response.json();
}

/**
 * Get Threads user profile
 */
export async function getThreadsProfile(accessToken: string) {
  const params = new URLSearchParams({
    fields: "id,username,threads_profile_picture_url,threads_biography",
    access_token: accessToken,
  });

  const response = await fetch(`${THREADS_GRAPH_URL}/me?${params.toString()}`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Threads profile: ${error}`);
  }

  return response.json();
}

/**
 * Validate access token
 */
export async function validateAccessToken(accessToken: string): Promise<boolean> {
  try {
    await getThreadsProfile(accessToken);
    return true;
  } catch (error) {
    return false;
  }
}

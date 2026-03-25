/**
 * Threads OAuth Authentication Helper
 * 
 * Handles OAuth authentication flow for Threads API
 */

import { ENV } from "./_core/env";

const THREADS_OAUTH_URL = "https://threads.net/oauth/authorize";
const THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const THREADS_GRAPH_URL = "https://graph.threads.net/v1.0";

export interface ThreadsAuthConfig {
  redirectUri: string;
  scope?: string[];
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

/**
 * Generate OAuth authorization URL
 */
export function getThreadsAuthUrl(config: ThreadsAuthConfig): string {
  const defaultScopes = [
    "threads_basic",
    "threads_content_publish",
    "threads_manage_replies",
    "threads_read_replies",
  ];

  const scopes = config.scope || defaultScopes;
  
  const params = new URLSearchParams({
    client_id: ENV.threadsAppId,
    redirect_uri: config.redirectUri,
    scope: scopes.join(","),
    response_type: "code",
  });

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
  redirectUri: string
): Promise<ThreadsTokenResponse> {
  const params = new URLSearchParams({
    client_id: ENV.threadsAppId,
    client_secret: ENV.threadsAppSecret,
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
  shortLivedToken: string
): Promise<ThreadsLongLivedTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_secret: ENV.threadsAppSecret,
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

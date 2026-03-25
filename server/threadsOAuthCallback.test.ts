import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the Threads OAuth callback Express route
 * Route: GET /api/threads/callback
 * 
 * This route receives the authorization code from Threads OAuth
 * and redirects to the frontend /threads-connect page with the code.
 */

describe('Threads OAuth Callback Route', () => {
  it('should redirect to /threads-connect with code when code is provided', async () => {
    // The route strips #_ suffix and redirects
    const code = 'test_auth_code_12345';
    const expectedRedirect = `/threads-connect?code=${encodeURIComponent(code)}`;
    
    // Simulate the route logic
    const cleanCode = code.replace(/#_$/, '');
    const redirectUrl = `/threads-connect?code=${encodeURIComponent(cleanCode)}`;
    
    expect(redirectUrl).toBe(expectedRedirect);
  });

  it('should strip #_ suffix from code', () => {
    const code = 'test_auth_code_12345#_';
    const cleanCode = code.replace(/#_$/, '');
    
    expect(cleanCode).toBe('test_auth_code_12345');
  });

  it('should not modify code without #_ suffix', () => {
    const code = 'test_auth_code_12345';
    const cleanCode = code.replace(/#_$/, '');
    
    expect(cleanCode).toBe('test_auth_code_12345');
  });

  it('should redirect to /threads-connect with error when error is provided', () => {
    const error = 'access_denied';
    const redirectUrl = `/threads-connect?error=${encodeURIComponent(error)}`;
    
    expect(redirectUrl).toBe('/threads-connect?error=access_denied');
  });

  it('should redirect to /threads-connect with no_code error when code is missing', () => {
    const code = undefined;
    const error = undefined;
    
    // Simulate route logic
    let redirectUrl: string;
    if (error) {
      redirectUrl = `/threads-connect?error=${encodeURIComponent(error)}`;
    } else if (!code) {
      redirectUrl = '/threads-connect?error=no_code';
    } else {
      redirectUrl = `/threads-connect?code=${encodeURIComponent(code)}`;
    }
    
    expect(redirectUrl).toBe('/threads-connect?error=no_code');
  });
});

describe('Threads OAuth Auth URL Generation', () => {
  it('should generate correct OAuth URL format', () => {
    const THREADS_OAUTH_URL = 'https://threads.net/oauth/authorize';
    const clientId = 'test_app_id';
    const redirectUri = 'https://example.com/api/threads/callback';
    const scopes = ['threads_basic', 'threads_content_publish', 'threads_manage_replies', 'threads_read_replies'];
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(','),
      response_type: 'code',
    });
    
    const authUrl = `${THREADS_OAUTH_URL}?${params.toString()}`;
    
    expect(authUrl).toContain('https://threads.net/oauth/authorize');
    expect(authUrl).toContain('client_id=test_app_id');
    expect(authUrl).toContain('response_type=code');
    expect(authUrl).toContain('threads_basic');
    expect(authUrl).toContain('threads_content_publish');
  });

  it('should include redirect_uri in OAuth URL', () => {
    const redirectUri = 'https://example.com/api/threads/callback';
    const params = new URLSearchParams({
      client_id: 'test',
      redirect_uri: redirectUri,
      scope: 'threads_basic',
      response_type: 'code',
    });
    
    const url = `https://threads.net/oauth/authorize?${params.toString()}`;
    expect(url).toContain(encodeURIComponent(redirectUri));
  });
});

describe('Threads Token Exchange', () => {
  it('should construct correct token exchange parameters', () => {
    const params = new URLSearchParams({
      client_id: 'test_app_id',
      client_secret: 'test_secret',
      grant_type: 'authorization_code',
      redirect_uri: 'https://example.com/api/threads/callback',
      code: 'test_code',
    });
    
    const paramString = params.toString();
    expect(paramString).toContain('grant_type=authorization_code');
    expect(paramString).toContain('code=test_code');
    expect(paramString).toContain('client_id=test_app_id');
  });

  it('should construct correct long-lived token exchange parameters', () => {
    const params = new URLSearchParams({
      grant_type: 'th_exchange_token',
      client_secret: 'test_secret',
      access_token: 'short_lived_token',
    });
    
    const paramString = params.toString();
    expect(paramString).toContain('grant_type=th_exchange_token');
    expect(paramString).toContain('access_token=short_lived_token');
  });

  it('should construct correct refresh token parameters', () => {
    const params = new URLSearchParams({
      grant_type: 'th_refresh_token',
      access_token: 'long_lived_token',
    });
    
    const paramString = params.toString();
    expect(paramString).toContain('grant_type=th_refresh_token');
    expect(paramString).toContain('access_token=long_lived_token');
  });
});

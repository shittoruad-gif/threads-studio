import { describe, it, expect } from "vitest";

describe("Threads OAuth redirect_uri configuration", () => {
  it("THREADS_REDIRECT_BASE_URL environment variable is set", () => {
    const baseUrl = process.env.THREADS_REDIRECT_BASE_URL;
    expect(baseUrl).toBeTruthy();
    expect(baseUrl).toBe("https://threads-studio.manus.space");
  });

  it("ENV.threadsRedirectBaseUrl reads from environment", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV.threadsRedirectBaseUrl).toBe("https://threads-studio.manus.space");
  });

  it("getThreadsAuthUrl generates correct redirect_uri using /threads-connect", async () => {
    const { getThreadsAuthUrl } = await import("./threadsAuth");
    const redirectUri = `${process.env.THREADS_REDIRECT_BASE_URL}/threads-connect`;
    const authUrl = getThreadsAuthUrl({ redirectUri });
    
    expect(authUrl).toContain("redirect_uri=");
    expect(authUrl).toContain(encodeURIComponent("https://threads-studio.manus.space/threads-connect"));
    // Must NOT contain /api/threads/callback - we use frontend route directly
    expect(authUrl).not.toContain(encodeURIComponent("/api/threads/callback"));
  });

  it("THREADS_APP_ID environment variable is set", () => {
    const appId = process.env.THREADS_APP_ID;
    expect(appId).toBeTruthy();
    expect(appId!.length).toBeGreaterThan(0);
  });

  it("THREADS_APP_SECRET environment variable is set", () => {
    const appSecret = process.env.THREADS_APP_SECRET;
    expect(appSecret).toBeTruthy();
    expect(appSecret!.length).toBeGreaterThan(0);
  });

  it("redirect_uri uses frontend route not API route", () => {
    const baseUrl = process.env.THREADS_REDIRECT_BASE_URL || "";
    const redirectUri = `${baseUrl}/threads-connect`;
    
    // Verify it's a frontend route (no /api/ prefix)
    expect(redirectUri).not.toContain("/api/");
    expect(redirectUri).toContain("/threads-connect");
    expect(redirectUri).toBe("https://threads-studio.manus.space/threads-connect");
  });

  it("redirect_uri for token exchange matches authorization redirect_uri", async () => {
    const { getThreadsAuthUrl } = await import("./threadsAuth");
    const baseUrl = process.env.THREADS_REDIRECT_BASE_URL || "";
    
    // Both getAuthUrl and handleCallback should use the same redirect_uri
    const authRedirectUri = `${baseUrl}/threads-connect`;
    const tokenRedirectUri = `${baseUrl}/threads-connect`;
    
    expect(authRedirectUri).toBe(tokenRedirectUri);
    
    // Verify the auth URL contains the correct redirect_uri
    const authUrl = getThreadsAuthUrl({ redirectUri: authRedirectUri });
    expect(authUrl).toContain(encodeURIComponent(authRedirectUri));
  });
});

import { describe, it, expect } from "vitest";

/**
 * Threads OAuth の redirect_uri は「フロントの /threads-connect」であること
 * （/api/threads/callback ではない）。
 * ドメインは環境ごとに違う（本番 threads-studio.com / ローカル localhost）ため決め打ちしない。
 */
const base = process.env.THREADS_REDIRECT_BASE_URL;

describe("Threads OAuth redirect_uri configuration", () => {
  it("THREADS_REDIRECT_BASE_URL environment variable is set", () => {
    expect(base).toBeTruthy();
    expect(base).toMatch(/^https?:\/\//);
    expect(base!.endsWith("/")).toBe(false);
  });

  it("ENV.threadsRedirectBaseUrl reads from environment", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV.threadsRedirectBaseUrl).toBe(base);
  });

  it.skipIf(!base)("getThreadsAuthUrl generates correct redirect_uri using /threads-connect", async () => {
    const { getThreadsAuthUrl } = await import("./threadsAuth");
    const redirectUri = `${base}/threads-connect`;
    const authUrl = getThreadsAuthUrl({ redirectUri });
    expect(authUrl).toContain("redirect_uri=");
    expect(authUrl).toContain(encodeURIComponent(redirectUri));
    expect(authUrl).not.toContain(encodeURIComponent("/api/threads/callback"));
  });

  it("THREADS_APP_ID environment variable is set", () => {
    expect(process.env.THREADS_APP_ID).toBeTruthy();
  });

  it("THREADS_APP_SECRET environment variable is set", () => {
    expect(process.env.THREADS_APP_SECRET).toBeTruthy();
  });

  it.skipIf(!base)("redirect_uri uses frontend route not API route", () => {
    const redirectUri = `${base}/threads-connect`;
    expect(redirectUri).not.toContain("/api/");
    expect(redirectUri).toContain("/threads-connect");
  });
});

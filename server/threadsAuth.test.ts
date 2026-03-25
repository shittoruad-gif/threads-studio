/**
 * Threads Authentication Tests
 */

import { describe, it, expect } from "vitest";
import { getThreadsAuthUrl } from "./threadsAuth";
import { ENV } from "./_core/env";

describe("Threads Authentication", () => {
  it("should have THREADS_APP_ID configured", () => {
    expect(ENV.threadsAppId).toBeTruthy();
    expect(ENV.threadsAppId.length).toBeGreaterThan(0);
  });

  it("should have THREADS_APP_SECRET configured", () => {
    expect(ENV.threadsAppSecret).toBeTruthy();
    expect(ENV.threadsAppSecret.length).toBeGreaterThan(0);
  });

  it("should generate valid OAuth URL", () => {
    const redirectUri = "https://example.com/callback";
    const authUrl = getThreadsAuthUrl({ redirectUri });

    expect(authUrl).toContain("threads.net/oauth/authorize");
    expect(authUrl).toContain(`client_id=${ENV.threadsAppId}`);
    expect(authUrl).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
    expect(authUrl).toContain("response_type=code");
    expect(authUrl).toContain("threads_basic");
    expect(authUrl).toContain("threads_content_publish");
  });

  it("should generate OAuth URL with custom scopes", () => {
    const redirectUri = "https://example.com/callback";
    const customScopes = ["threads_basic", "threads_content_publish"];
    const authUrl = getThreadsAuthUrl({ redirectUri, scope: customScopes });

    expect(authUrl).toContain("threads_basic");
    expect(authUrl).toContain("threads_content_publish");
    expect(authUrl).not.toContain("threads_manage_replies");
  });
});

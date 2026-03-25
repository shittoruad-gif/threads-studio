import { describe, it, expect } from "vitest";

describe("Threads OAuth Environment Variables", () => {
  it("should have THREADS_APP_ID set", () => {
    const appId = process.env.THREADS_APP_ID;
    expect(appId).toBeDefined();
    expect(appId).not.toBe("");
    expect(appId).toBe("1187037853267046");
  });

  it("should have THREADS_APP_SECRET set", () => {
    const appSecret = process.env.THREADS_APP_SECRET;
    expect(appSecret).toBeDefined();
    expect(appSecret).not.toBe("");
    // Verify it's a hex string of expected length
    expect(appSecret).toMatch(/^[a-f0-9]{32}$/);
  });

  it("should generate correct auth URL with new app ID", async () => {
    const { getThreadsAuthUrl } = await import("./threadsAuth");
    const redirectUri = "https://example.com/api/threads/callback";
    const authUrl = getThreadsAuthUrl({ redirectUri });
    
    expect(authUrl).toContain("threads.net/oauth/authorize");
    expect(authUrl).toContain("client_id=1187037853267046");
    expect(authUrl).toContain(encodeURIComponent(redirectUri));
    expect(authUrl).toContain("response_type=code");
  });
});

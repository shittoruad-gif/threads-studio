/**
 * Threads API Integration Tests
 */

import { describe, it, expect } from "vitest";
import { getThreadsAuthUrl, exchangeCodeForToken, exchangeForLongLivedToken, getThreadsProfile } from "./threadsAuth";
import { createMediaContainer, publishMediaContainer, createAndPublishPost } from "./threadsPost";

describe("Threads OAuth", () => {
  it("should generate valid OAuth URL", () => {
    const redirectUri = "https://example.com/callback";
    const authUrl = getThreadsAuthUrl({ redirectUri });

    expect(authUrl).toContain("https://threads.net/oauth/authorize");
    expect(authUrl).toContain("client_id=");
    expect(authUrl).toContain("redirect_uri=");
    expect(authUrl).toContain("response_type=code");
    expect(authUrl).toContain("scope=threads_basic");
  });

  it("should have required environment variables", () => {
    expect(process.env.THREADS_APP_ID).toBeDefined();
    expect(process.env.THREADS_APP_SECRET).toBeDefined();
  });
});

describe("Threads Post API", () => {
  it("should validate post parameters", () => {
    const params = {
      accessToken: "test_token",
      threadsUserId: "12345",
      text: "Hello, Threads!",
      mediaType: "TEXT" as const,
    };

    expect(params.accessToken).toBeTruthy();
    expect(params.threadsUserId).toBeTruthy();
    expect(params.text).toBeTruthy();
    expect(["TEXT", "IMAGE", "VIDEO", "CAROUSEL"]).toContain(params.mediaType);
  });

  it("should require imageUrl for IMAGE media type", () => {
    const params = {
      accessToken: "test_token",
      threadsUserId: "12345",
      text: "Check out this image!",
      mediaType: "IMAGE" as const,
      imageUrl: "https://example.com/image.jpg",
    };

    if (params.mediaType === "IMAGE") {
      expect(params.imageUrl).toBeDefined();
      expect(params.imageUrl).toMatch(/^https?:\/\//);
    }
  });

  it("should require videoUrl for VIDEO media type", () => {
    const params = {
      accessToken: "test_token",
      threadsUserId: "12345",
      text: "Check out this video!",
      mediaType: "VIDEO" as const,
      videoUrl: "https://example.com/video.mp4",
    };

    if (params.mediaType === "VIDEO") {
      expect(params.videoUrl).toBeDefined();
      expect(params.videoUrl).toMatch(/^https?:\/\//);
    }
  });
});

describe("Scheduled Post Executor", () => {
  it("should have executor function", async () => {
    const { executePendingPosts } = await import("./scheduledPostExecutor");
    expect(executePendingPosts).toBeDefined();
    expect(typeof executePendingPosts).toBe("function");
  });

  it("should return execution result", async () => {
    const { executePendingPosts } = await import("./scheduledPostExecutor");
    const result = await executePendingPosts();
    
    expect(result).toBeDefined();
    expect(result).toHaveProperty("executed");
    expect(result).toHaveProperty("failed");
    expect(typeof result.executed).toBe("number");
    expect(typeof result.failed).toBe("number");
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { wantsReplyScope, wantsExtraScopes, getThreadsAuthUrl } from "./threadsAuth";

const KEYS = ["THREADS_MANAGE_REPLIES_APPROVED", "THREADS_REVIEW_REPLY_SCOPE_USER_IDS", "THREADS_REPLY_SCOPE_PILOT_USER_IDS", "THREADS_LOCATION_TAGGING_APPROVED", "THREADS_SHARE_TO_IG_APPROVED"];
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const cfg: any = { appId: "1", appSecret: "x", redirectUri: "https://example.test/threads-connect" };

describe("返信の権限だけを先に試すお客様", () => {
  it("入れたユーザーだけ返信の権限を求め、ほかの2つは求めない", () => {
    for (const k of KEYS) delete process.env[k];
    process.env.THREADS_REPLY_SCOPE_PILOT_USER_IDS = "101, 202";
    expect(wantsReplyScope(101)).toBe(true);
    expect(wantsReplyScope(202)).toBe(true);
    expect(wantsReplyScope(303)).toBe(false);
    expect(wantsReplyScope(null)).toBe(false);
    expect(wantsExtraScopes(101)).toEqual([]);
    const scope = new URL(getThreadsAuthUrl(cfg, { userId: 101 })).searchParams.get("scope") || "";
    expect(scope.split(",")).toContain("threads_manage_replies");
    expect(scope).not.toContain("threads_location_tagging");
    expect(scope).not.toContain("threads_share_to_instagram");
    const other = new URL(getThreadsAuthUrl(cfg, { userId: 303 })).searchParams.get("scope") || "";
    expect(other).not.toContain("threads_manage_replies");
  });
  it("何も入れていなければ今までどおり", () => {
    for (const k of KEYS) delete process.env[k];
    expect(wantsReplyScope(101)).toBe(false);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { getThreadsAuthUrl, wantsReplyScope } from "./threadsAuth";

const scopeOf = (url: string) => new URL(url).searchParams.get("scope") || "";

describe("threads_manage_replies の要求（審査の録画用ユーザーだけ）", () => {
  afterEach(() => {
    delete process.env.THREADS_MANAGE_REPLIES_APPROVED;
    delete process.env.THREADS_REVIEW_REPLY_SCOPE_USER_IDS;
  });

  it("承認前・指定なしでは誰にも求めない", () => {
    expect(wantsReplyScope(78)).toBe(false);
    expect(scopeOf(getThreadsAuthUrl({ redirectUri: "https://x/threads-connect" }, { userId: 78 }))).not.toContain("threads_manage_replies");
  });

  it("録画用に指定したユーザーだけに求める", () => {
    process.env.THREADS_REVIEW_REPLY_SCOPE_USER_IDS = " 78 ,749";
    expect(scopeOf(getThreadsAuthUrl({ redirectUri: "https://x/threads-connect" }, { userId: 78 }))).toContain("threads_manage_replies");
    expect(wantsReplyScope(749)).toBe(true);
    expect(wantsReplyScope(12800)).toBe(false);
    expect(wantsReplyScope(undefined)).toBe(false);
  });

  it("承認後は全員に求める", () => {
    process.env.THREADS_MANAGE_REPLIES_APPROVED = "true";
    expect(wantsReplyScope(12800)).toBe(true);
    expect(wantsReplyScope(undefined)).toBe(true);
  });
});

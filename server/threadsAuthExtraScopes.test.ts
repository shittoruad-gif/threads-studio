import { afterEach, describe, expect, it } from "vitest";
import { getThreadsAuthUrl, hasExtraScope, wantsExtraScopes } from "./threadsAuth";

const ENV = ["THREADS_LOCATION_TAGGING_APPROVED", "THREADS_SHARE_TO_IG_APPROVED", "THREADS_REVIEW_REPLY_SCOPE_USER_IDS"];
afterEach(() => { for (const k of ENV) delete process.env[k]; });

describe("場所のタグ・Instagram同時シェアの権限", () => {
  it("承認前は録画用ユーザーだけに求める（一般のお客様の連携を失敗させない）", () => {
    process.env.THREADS_REVIEW_REPLY_SCOPE_USER_IDS = "78";
    expect(wantsExtraScopes(78)).toEqual(["threads_location_tagging", "threads_share_to_instagram"]);
    expect(wantsExtraScopes(500)).toEqual([]);
    expect(wantsExtraScopes(null)).toEqual([]);
  });
  it("承認後は環境変数で全員に", () => {
    process.env.THREADS_LOCATION_TAGGING_APPROVED = "true";
    expect(wantsExtraScopes(500)).toEqual(["threads_location_tagging"]);
  });
  it("連携URLの scope に入る／入らない", () => {
    process.env.THREADS_REVIEW_REPLY_SCOPE_USER_IDS = "78";
    const cfg = { redirectUri: "https://example.com/cb" } as any;
    const creds = { appId: "1", appSecret: "x" } as any;
    const mine = decodeURIComponent(getThreadsAuthUrl(cfg, { userId: 78 }, creds));
    const other = decodeURIComponent(getThreadsAuthUrl(cfg, { userId: 500 }, creds));
    expect(mine).toContain("threads_location_tagging");
    expect(mine).toContain("threads_share_to_instagram");
    expect(other).not.toContain("threads_location_tagging");
  });
  it("記録した権限の読み取り", () => {
    expect(hasExtraScope("threads_location_tagging,threads_share_to_instagram", "threads_share_to_instagram")).toBe(true);
    expect(hasExtraScope(null, "threads_location_tagging")).toBe(false);
  });
});

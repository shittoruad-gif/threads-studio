import { describe, it, expect, vi, afterEach } from "vitest";
import { createMediaContainer, isTransientCreateError, CREATE_RETRY_DELAYS_MS } from "./threadsPost";

const ERR_2 = '{"error":{"message":"An unexpected error has occurred. Please retry your request later.","code":2,"type":"OAuthException","is_transient":true}}';
const ERR_TOKEN = '{"error":{"message":"Invalid OAuth 2.0 Access Token","code":190,"type":"OAuthException"}}';
const res = (ok: boolean, body: string, status = ok ? 200 : 500) => ({ ok, status, text: async () => body, json: async () => JSON.parse(body) });
const P = { accessToken: "t", threadsUserId: "u", text: "x" } as any;

describe("下書きの作成の一時的なエラーはやり直す（2026-11-24）", () => {
  const saved = [...CREATE_RETRY_DELAYS_MS];
  afterEach(() => { CREATE_RETRY_DELAYS_MS.splice(0, CREATE_RETRY_DELAYS_MS.length, ...saved); vi.unstubAllGlobals(); });

  it("見分け：一時的＝やり直す／トークン・権限＝やり直さない", () => {
    expect(isTransientCreateError(500, ERR_2)).toBe(true);
    expect(isTransientCreateError(400, ERR_TOKEN)).toBe(false);
    expect(isTransientCreateError(400, '{"error":{"message":"Invalid parameter","code":100}}')).toBe(false);
    expect(isTransientCreateError(503, "")).toBe(true);
  });

  it("1回目が一時的なエラーでも、2回目で作れれば成功", async () => {
    CREATE_RETRY_DELAYS_MS.splice(0, 2, 0, 0);
    const f = vi.fn().mockResolvedValueOnce(res(false, ERR_2)).mockResolvedValueOnce(res(true, '{"id":"c1"}'));
    vi.stubGlobal("fetch", f);
    await expect(createMediaContainer(P)).resolves.toEqual({ id: "c1" });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("3回続けて一時的なエラーなら失敗（やり直しは2回まで）", async () => {
    CREATE_RETRY_DELAYS_MS.splice(0, 2, 0, 0);
    const f = vi.fn().mockResolvedValue(res(false, ERR_2));
    vi.stubGlobal("fetch", f);
    await expect(createMediaContainer(P)).rejects.toThrow(/Failed to create media container/);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("トークン切れはやり直さない（1回で失敗）", async () => {
    const f = vi.fn().mockResolvedValue(res(false, ERR_TOKEN, 400));
    vi.stubGlobal("fetch", f);
    await expect(createMediaContainer(P)).rejects.toThrow(/Invalid OAuth/);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

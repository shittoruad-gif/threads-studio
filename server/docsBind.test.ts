import { describe, it, expect, vi } from "vitest";
import { parseDocsBind, tryDocsBind } from "./docsBind";

const U = "U" + "b".repeat(32);

describe("請求書・領収書の受け取り登録（書類 合言葉）", () => {
  it("「書類 ABC234」だけを拾う", () => {
    expect(parseDocsBind("書類 abc234")).toBe("ABC234");
    expect(parseDocsBind("書類　ABC234")).toBe("ABC234");
    expect(parseDocsBind("書類ABC234")).toBe("ABC234");
    expect(parseDocsBind("書類を送ってください")).toBeUndefined();
    expect(parseDocsBind("ABC234")).toBeUndefined();
  });
  it("関係ない文は素通り（null）", async () => {
    const fetchFn = vi.fn();
    expect(await tryDocsBind(U, "こんにちは", { url: "https://x", secret: "s", fetchFn: fetchFn as any })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("契約管理へ中継して、結果をお返しする", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ ok: true, clientName: "テスト院" }), { status: 200 }));
    const r = (await tryDocsBind(U, "書類 ABC234", { url: "https://x/api/docs/line-bind", secret: "s", fetchFn: fetchFn as any })) as { text: string }[];
    expect(r[0]!.text).toMatch(/テスト院様の請求書・領収書の受け取りを登録しました/);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(init.headers["X-Docs-Secret"]).toBe("s");
    expect(JSON.parse(init.body)).toEqual({ text: "書類 ABC234", userId: U });
  });
  it("合言葉違い・失敗・未設定でも必ず一言返す", async () => {
    const ng = vi.fn(async () => new Response(JSON.stringify({ ok: false, reason: "unknown_code" }), { status: 200 }));
    expect(((await tryDocsBind(U, "書類 ZZZZZZ", { url: "u", secret: "s", fetchFn: ng as any })) as { text: string }[])[0]!.text).toMatch(/見つかりません/);
    const err = vi.fn(async () => new Response("x", { status: 500 }));
    expect(((await tryDocsBind(U, "書類 ZZZZZZ", { url: "u", secret: "s", fetchFn: err as any })) as { text: string }[])[0]!.text).toMatch(/受け付けできません/);
    expect(((await tryDocsBind(U, "書類 ZZZZZZ", { url: "", secret: "" })) as { text: string }[])[0]!.text).toMatch(/準備中/);
  });
});

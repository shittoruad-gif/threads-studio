/** マカセルから呼ばれる口の合言葉と「確かめる」の返し方（2026-10-28・DBにはつながない） */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerMediaApi } from "./mediaApi";
import { mediaSecretOk } from "./mediaItems";

const SECRET = "test-secret-1234";
let base = "";
let server: any;
const seen: string[] = [];

beforeAll(async () => {
  const app = express();
  registerMediaApi(app, {
    secretOk: (g) => String(g ?? "") === SECRET,
    intakeVideo: async () => ({ ok: true, id: 1 }),
    linkCheck: async (email) => {
      seen.push(email);
      if (email === "pro@example.com") return { ok: true, found: true, proOrAbove: true, name: "漏れてはいけない", id: 9, planId: "pro" } as any;
      if (email === "light@example.com") return { ok: true, found: true, proOrAbove: false };
      return { ok: true, found: false, proOrAbove: false };
    },
  });
  await new Promise<void>((r) => { server = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

const post = (path: string, body: unknown, secret?: string) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-media-secret": secret } : {}) }, body: JSON.stringify(body) });

describe("POST /api/media/link-check", () => {
  it("合言葉が無い・違うときは 401 で、確認もしない", async () => {
    const before = seen.length;
    expect((await post("/api/media/link-check", { email: "pro@example.com" })).status).toBe(401);
    expect((await post("/api/media/link-check", { email: "pro@example.com" }, "wrong")).status).toBe(401);
    expect(seen.length).toBe(before);
  });
  it("真偽の2つだけを返す（名前・番号・プラン名は返さない）", async () => {
    const r = await post("/api/media/link-check", { email: "pro@example.com" }, SECRET);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, found: true, proOrAbove: true });
  });
  it("会員がいるがプロ以上ではない／会員がいない", async () => {
    expect(await (await post("/api/media/link-check", { email: "light@example.com" }, SECRET)).json()).toEqual({ ok: true, found: true, proOrAbove: false });
    expect(await (await post("/api/media/link-check", { email: "none@example.com" }, SECRET)).json()).toEqual({ ok: true, found: false, proOrAbove: false });
  });
});

describe("POST /api/media/intake", () => {
  it("合言葉が無いときは 401・合っていれば受け取る", async () => {
    expect((await post("/api/media/intake", { email: "a@example.com" })).status).toBe(401);
    const r = await post("/api/media/intake", { email: "a@example.com", videoUrl: "https://x/v.mp4", sourceRef: "s1" }, SECRET);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, id: 1 });
  });
});

describe("mediaSecretOk", () => {
  const prev = process.env.MEDIA_INTAKE_SECRET;
  afterAll(() => { if (prev === undefined) delete process.env.MEDIA_INTAKE_SECRET; else process.env.MEDIA_INTAKE_SECRET = prev; });
  it("合言葉が未設定なら何を渡しても不可", () => {
    delete process.env.MEDIA_INTAKE_SECRET;
    expect(mediaSecretOk("")).toBe(false);
    expect(mediaSecretOk("anything")).toBe(false);
  });
  it("一致したときだけ可（長さ違い・空・未指定は不可）", () => {
    process.env.MEDIA_INTAKE_SECRET = SECRET;
    expect(mediaSecretOk(SECRET)).toBe(true);
    expect(mediaSecretOk(SECRET + "x")).toBe(false);
    expect(mediaSecretOk(undefined)).toBe(false);
    expect(mediaSecretOk("test-secret-123X")).toBe(false);
  });
});

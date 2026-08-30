import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import {
  verifyLineSignature, generateLinkCode, buildApprovalMessages,
  lineNotifyEnabled, LINK_CODE_TTL_MS, LINE_TEXTS,
} from "./lineNotify";

const SECRET = "test-secret";

describe("LINE通知連携", () => {
  beforeEach(() => {
    process.env.LINE_NOTIFY_CHANNEL_SECRET = SECRET;
    process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN = "test-token";
  });
  afterEach(() => {
    delete process.env.LINE_NOTIFY_CHANNEL_SECRET;
    delete process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN;
  });

  it("環境変数が無ければ全体が無効（既存動作に影響しない）", () => {
    delete process.env.LINE_NOTIFY_CHANNEL_SECRET;
    expect(lineNotifyEnabled()).toBe(false);
  });

  it("正しい署名だけを通す", () => {
    const body = Buffer.from(JSON.stringify({ events: [] }));
    const good = crypto.createHmac("sha256", SECRET).update(body).digest("base64");
    expect(verifyLineSignature(body, good)).toBe(true);
    expect(verifyLineSignature(body, "x".repeat(good.length))).toBe(false);
    expect(verifyLineSignature(body, undefined)).toBe(false);
  });

  it("連携コードは6桁の数字で、期限は10分", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateLinkCode()).toMatch(/^\d{6}$/);
    }
    expect(LINK_CODE_TTL_MS).toBe(10 * 60 * 1000);
  });

  it("承認依頼は導入文+Flexの2メッセージにまとまる（通数節約）", () => {
    const posts = [
      { id: 1, postContent: "明日の投稿その1です。", scheduledAt: "2026-09-01T06:00:00Z" },
      { id: 2, postContent: "明日の投稿その2です。", scheduledAt: "2026-09-01T12:00:00Z" },
      { id: 3, postContent: "明日の投稿その3です。", scheduledAt: "2026-09-01T13:00:00Z" },
    ];
    const msgs = buildApprovalMessages(posts, (id) => `https://example.com/approve?post=${id}`) as any[];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].text).toContain("3件");
    expect(msgs[1].type).toBe("flex");
    const flex = JSON.stringify(msgs[1]);
    expect(flex).toContain("https://example.com/approve?post=1");
    expect(flex).toContain("https://example.com/approve?post=3");
  });

  it("公開予定時刻は日本時間で表示される", () => {
    // UTC 06:00 = JST 15:00
    const msgs = buildApprovalMessages(
      [{ id: 1, postContent: "本文", scheduledAt: "2026-09-01T06:00:00Z" }],
      () => "https://example.com/a",
    );
    expect(JSON.stringify(msgs)).toContain("9/1 15:00");
  });

  it("定型文にAIの口癖（同意確認疑問等）が入っていない", () => {
    const all = Object.values(LINE_TEXTS).join("");
    for (const banned of ["いませんか？", "ですよね", "思っていませんか"]) {
      expect(all.includes(banned)).toBe(false);
    }
  });
});

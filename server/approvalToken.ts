/**
 * メール内リンクからログインなしで「承認 / 見送り」を行うための署名付きトークン。
 *
 * 目的：承認待ちのまま放置されて投稿が止まる事故を防ぐ。
 * クライアントはメールのボタンを押すだけで、その1投稿だけを承認できる。
 *
 * 安全性の考え方：
 *  - HMAC-SHA256 署名つき。秘密鍵(JWT_SECRET)を知らないと発行できない＝推測不可。
 *  - 対象は「1投稿」「1操作」に限定。ログインセッションは発行しないので、
 *    トークンが漏れても他の画面やデータには一切アクセスできない。
 *  - 有効期限つき（既定7日）。期限切れは無効。
 *  - 比較は timingSafeEqual（総当たりのタイミング攻撃対策）。
 */
import { createHmac, timingSafeEqual } from "crypto";

export type ApprovalAction = "approve" | "skip";

interface TokenPayload {
  /** scheduledPosts.id */
  p: number;
  /** users.id（トークンの持ち主。投稿の所有者と一致しなければ無効） */
  u: number;
  /** 操作 */
  a: ApprovalAction;
  /** 有効期限（UNIX秒） */
  e: number;
}

const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60;

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set; cannot sign approval tokens");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(body: string): string {
  return b64url(createHmac("sha256", secret()).update(body).digest());
}

export function createApprovalToken(
  postId: number,
  userId: number,
  action: ApprovalAction,
  ttlSec: number = DEFAULT_TTL_SEC,
): string {
  const payload: TokenPayload = {
    p: postId,
    u: userId,
    a: action,
    e: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${sign(body)}`;
}

export function verifyApprovalToken(
  token: unknown,
): { postId: number; userId: number; action: ApprovalAction } | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  let expected: Buffer;
  try {
    expected = fromB64url(sign(body));
  } catch {
    return null;
  }
  const given = fromB64url(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload?.p !== "number" || typeof payload?.u !== "number") return null;
  if (payload.a !== "approve" && payload.a !== "skip") return null;
  if (typeof payload.e !== "number" || payload.e < Math.floor(Date.now() / 1000)) return null;

  return { postId: payload.p, userId: payload.u, action: payload.a };
}

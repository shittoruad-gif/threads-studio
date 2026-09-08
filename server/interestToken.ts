/**
 * 「サービスの詳細を希望する」ボタン用の署名トークン（2026-09-07 三上様指示：詳細希望のメールを見逃す）。
 * 以前は案内メールの mailto（件名「サービスの詳細希望」）に頼っていて、届いたメールが運営のLINEに出ず見逃していた。
 * ボタンを押すと当社のURLに来るので、誰が・どのサービスかを記録し、運営のLINEへ即通知する。
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not configured");
  return s;
}
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

export function createInterestToken(userId: number, slug: string, now: number = Date.now()): string {
  const body = b64(JSON.stringify({ u: userId, s: slug, t: now }));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyInterestToken(token: string, maxAgeMs: number = 180 * 86400000): { userId: number; slug: string } | null {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expect = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(expect), b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(unb64(body));
    if (!p?.u || !p?.s || !p?.t || Date.now() - Number(p.t) > maxAgeMs) return null;
    return { userId: Number(p.u), slug: String(p.s) };
  } catch { return null; }
}

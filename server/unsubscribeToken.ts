/**
 * ご案内メールの配信停止リンク用の署名つきトークン。
 *
 * 考え方は承認トークン（server/approvalToken.ts）と同じ:
 *  - HMAC-SHA256 署名。秘密鍵を知らないと発行できない。
 *  - できることは「そのユーザーのご案内メールを止める」ことだけ。
 *    ログインセッションは発行しないので、漏れても他のデータには触れられない。
 *  - 配信停止に期限を設けると「古いメールから止められない」ことになるため、期限は設けない。
 */
import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set; cannot sign unsubscribe tokens");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(body: string): string {
  return b64url(createHmac("sha256", secret()).update(body).digest());
}

export function createUnsubscribeToken(userId: number): string {
  const body = b64url(Buffer.from(JSON.stringify({ u: userId }), "utf8"));
  return `${body}.${sign(body)}`;
}

export function verifyUnsubscribeToken(token: unknown): number | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let expected: Buffer;
  let given: Buffer;
  try {
    expected = Buffer.from(sign(body));
    given = Buffer.from(sig);
  } catch {
    return null;
  }
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    const id = Number(payload?.u);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

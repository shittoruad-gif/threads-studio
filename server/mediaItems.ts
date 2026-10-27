/**
 * 写真・動画の置き場と、その出し入れ（shared/mediaPosts.ts・2026-10-26）。
 *  - 公式LINEで送られた写真を預かる（saveLineImage）
 *  - マカセルの動画を受け取る（POST /api/media/intake・合言葉 MEDIA_INTAKE_SECRET）
 *  - マカセルの設定画面の「確かめる」（POST /api/media/link-check・同じ合言葉・2026-10-28）
 *  - Threads が取りに来る公開URL（GET /m/<token>.jpg）
 *  - 自動投稿で1本に付けるものを選ぶ（pickMediaForUser）・使った記録（markMediaUsed）
 */
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import * as db from "./db";
import { MEDIA_POSTS, DESCRIBE_PROMPT, pickMedia, mediaPostsEnabledFor, isProOrAbove } from "../shared/mediaPosts";

const base = () => (process.env.APP_BASE_URL || "https://threads-studio.com").replace(/\/$/, "");
const rows = (r: any): any[] => (Array.isArray(r?.[0]) ? r[0] : r ?? []);

export function mediaPublicUrl(m: { kind: string; token: string; externalUrl?: string | null }): string {
  if (m.kind === "video" && m.externalUrl) return m.externalUrl;
  return `${base()}/m/${m.token}.jpg`;
}

async function planOf(userId: number): Promise<string | null> {
  const sub: any = await db.getSubscriptionByUserId(userId).catch(() => null);
  return sub && (sub.status === "active" || sub.status === "trialing") ? String(sub.planId) : null;
}

export async function mediaAllowed(userId: number): Promise<boolean> {
  return mediaPostsEnabledFor(userId, await planOf(userId));
}

/** 写真の中身を一言で（選ぶ・書くための材料）。失敗しても預かりは止めない */
async function describeImage(url: string): Promise<string | null> {
  try {
    const { invokeLLM } = await import("./_core/llm");
    const res: any = await invokeLLM({
      temperature: 0.2,
      messages: [{ role: "user", content: [{ type: "text", text: DESCRIBE_PROMPT }, { type: "image_url", image_url: { url, detail: "low" } }] as any }],
    } as any);
    const t = String(res?.choices?.[0]?.message?.content ?? "").trim();
    return t ? t.slice(0, 200) : null;
  } catch (e) {
    console.warn(`[Media] 写真の説明をとばしました: ${(e as Error)?.message}`);
    return null;
  }
}

/** 公式LINEで送られた写真を預かる。結果はお返しの文 */
export async function saveLineImage(userId: number, messageId: string): Promise<string> {
  if (!(await mediaAllowed(userId))) {
    // 2026-10-28 mode=on にしたので「準備中」の一文を外した
    return "写真を付けた自動投稿は、プロプラン（ビジネスプランを含む）でお使いいただけます。";
  }
  const token = process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN;
  if (!token) return "ただいま写真を受け取れませんでした。少し時間をおいて、もう一度送ってください。";
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return "写真を受け取れませんでした。もう一度送ってください。";
  const mime = res.headers.get("content-type") || "image/jpeg";
  if (!/^image\/(jpeg|png)/.test(mime)) return "この形式の写真は使えません（JPEG・PNGの写真を送ってください）。";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MEDIA_POSTS.maxImageBytes) return "写真が大きすぎるため預かれませんでした（8MBまで）。";
  const d: any = await db.getDb();
  const tok = crypto.randomBytes(16).toString("hex");
  const dup = rows(await d.execute(sql`SELECT id FROM mediaItems WHERE userId=${userId} AND source='line' AND sourceRef=${messageId} LIMIT 1`));
  if (dup.length) return "この写真はもう預かっています。";
  await d.execute(sql`INSERT INTO mediaItems (userId, token, kind, mime, data, source, sourceRef) VALUES (${userId}, ${tok}, 'image', ${mime}, ${buf}, 'line', ${messageId})`);
  const desc = await describeImage(`${base()}/m/${tok}.jpg`);
  if (desc) await d.execute(sql`UPDATE mediaItems SET description=${desc} WHERE token=${tok}`);
  const n = Number(rows(await d.execute(sql`SELECT COUNT(*) n FROM mediaItems WHERE userId=${userId} AND enabled=1`))[0]?.n ?? 0);
  return [
    "写真を預かりました。これから、1日1本の投稿にお店の写真を付けて出します（同じ写真は2週間あけて使います）。",
    desc ? `写っているもの：${desc}` : "",
    `いま預かっている写真：${n}枚`,
    "",
    "人の顔が写っている写真は、写っている方の了承がある写真だけにしてください。施術の前後の比較の写真は使えません。",
  ].filter((l, i) => l || i === 3).join("\n");
}

/** マカセルからの呼び出しの合言葉（MEDIA_INTAKE_SECRET）が合っているか。未設定なら常に不可（2026-10-28 共通化） */
export function mediaSecretOk(given: unknown): boolean {
  const secret = process.env.MEDIA_INTAKE_SECRET || "";
  const g = String(given ?? "");
  if (!secret || g.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(g), Buffer.from(secret));
}

/**
 * マカセルの「確かめる」（2026-10-28 三上様）。
 * このメールアドレスの会員がいるか・動画を受け取れるプラン（プロ以上）か、の2つだけを返す。
 * 名前・番号・プラン名は返さない（マカセル側にも出さない）。
 */
export async function linkCheck(emailRaw: string): Promise<{ ok: boolean; found: boolean; proOrAbove: boolean }> {
  const email = String(emailRaw || "").trim().toLowerCase();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, found: false, proOrAbove: false };
  const d: any = await db.getDb();
  const u = rows(await d.execute(sql`SELECT id FROM users WHERE LOWER(email)=${email} LIMIT 1`))[0];
  if (!u) return { ok: true, found: false, proOrAbove: false };
  return { ok: true, found: true, proOrAbove: await mediaAllowed(Number(u.id)) };
}

/** マカセルの動画を受け取る（マカセルがプランを確かめてから送る）。Threads Studio 側はプロ以上かを見る */
export async function intakeVideo(input: { email: string; videoUrl: string; title?: string; sourceRef: string }): Promise<{ ok: boolean; reason?: string; id?: number }> {
  const email = String(input.email || "").trim().toLowerCase();
  if (!email || !/^https:\/\/[^\s]+\.mp4(\?|$)/.test(String(input.videoUrl || ""))) return { ok: false, reason: "bad_input" };
  const d: any = await db.getDb();
  const u = rows(await d.execute(sql`SELECT id FROM users WHERE LOWER(email)=${email} LIMIT 1`))[0];
  if (!u) return { ok: false, reason: "no_user" };
  const userId = Number(u.id);
  if (!(await mediaAllowed(userId))) return { ok: false, reason: "not_eligible" };
  const dup = rows(await d.execute(sql`SELECT id FROM mediaItems WHERE userId=${userId} AND source='makaseru' AND sourceRef=${input.sourceRef} LIMIT 1`))[0];
  if (dup) return { ok: true, id: Number(dup.id) };
  const tok = crypto.randomBytes(16).toString("hex");
  const desc = input.title ? String(input.title).slice(0, 200) : null;
  await d.execute(sql`INSERT INTO mediaItems (userId, token, kind, mime, externalUrl, description, source, sourceRef) VALUES (${userId}, ${tok}, 'video', 'video/mp4', ${input.videoUrl}, ${desc}, 'makaseru', ${String(input.sourceRef).slice(0, 120)})`);
  const id = Number(rows(await d.execute(sql`SELECT id FROM mediaItems WHERE token=${tok}`))[0]?.id);
  console.log(`[Media] マカセルの動画を受け取りました user=${userId} media=${id}`);
  return { ok: true, id };
}

/** 今日この人の1本に付けるもの（無ければ null） */
export async function pickMediaForUser(userId: number): Promise<{ id: number; kind: string; description: string | null } | null> {
  if (!(await mediaAllowed(userId))) return null;
  const d: any = await db.getDb();
  const list = rows(await d.execute(sql`SELECT id, kind, description, usedCount, lastUsedAt, createdAt, enabled FROM mediaItems WHERE userId=${userId} AND enabled=1 ORDER BY id DESC LIMIT ${MEDIA_POSTS.maxItemsPerUser}`));
  const m = pickMedia(list.map((x: any) => ({ ...x, enabled: Number(x.enabled), usedCount: Number(x.usedCount) })));
  return m ? { id: Number(m.id), kind: String(m.kind), description: (m as any).description ?? null } : null;
}

/** 今日すでに写真・動画つきの投稿を作ったか（1日 perDay 本まで） */
export async function mediaPostsToday(userId: number): Promise<number> {
  const d: any = await db.getDb();
  return Number(rows(await d.execute(sql`SELECT COUNT(*) n FROM scheduledPosts WHERE userId=${userId} AND mediaItemId IS NOT NULL AND DATE(CONVERT_TZ(scheduledAt,'+00:00','+09:00'))=DATE(CONVERT_TZ(NOW(),'+00:00','+09:00'))`))[0]?.n ?? 0);
}

export async function markMediaUsed(id: number): Promise<void> {
  const d: any = await db.getDb();
  await d.execute(sql`UPDATE mediaItems SET usedCount=usedCount+1, lastUsedAt=NOW() WHERE id=${id}`);
}

export async function getMediaForPost(id: number): Promise<{ id: number; kind: string; token: string; externalUrl: string | null } | null> {
  const d: any = await db.getDb();
  const m = rows(await d.execute(sql`SELECT id, kind, token, externalUrl, enabled FROM mediaItems WHERE id=${id} LIMIT 1`))[0];
  return m && Number(m.enabled) === 1 ? { id: Number(m.id), kind: String(m.kind), token: String(m.token), externalUrl: m.externalUrl ?? null } : null;
}

/** GET /m/<token>.jpg（Threads が写真を取りに来る・推測できない32桁） */
export async function servePublicImage(token: string): Promise<{ mime: string; data: Buffer } | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const d: any = await db.getDb();
  const m = rows(await d.execute(sql`SELECT mime, data, enabled FROM mediaItems WHERE token=${token} AND kind='image' LIMIT 1`))[0];
  if (!m || Number(m.enabled) !== 1 || !m.data) return null;
  return { mime: String(m.mime), data: Buffer.from(m.data) };
}

export { isProOrAbove };

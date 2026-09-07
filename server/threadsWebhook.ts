/**
 * Threads Webhook（返信の即時通知）。2026-09-07 三上様指示「交流を自動化」。
 * これまで3時間おきの巡回だったコメント検知を、届いた瞬間にLINEの「返信の文案つきカード」へ。
 *
 * 設定（Meta App Dashboard → ユースケース → Threads Webhooks）：
 *   callback: https://threads-studio.com/api/threads/webhook
 *   verify token: 環境変数 THREADS_WEBHOOK_VERIFY_TOKEN と同じ文字列
 *   topic: Moderate / field: replies（threads_read_replies が必要＝既定スコープに含む）
 * 署名: X-Hub-Signature-256 = sha256=HMAC(app secret, raw body)
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import * as db from "./db";

export function verifyThreadsSignature(rawBody: string, header: string | undefined, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected); const b = Buffer.from(String(header));
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface ReplyEvent { id: string; username?: string; text?: string; timestamp?: string; shortcode?: string; rootOwnerId?: string; rootPostId?: string; repliedToId?: string }

/** Metaの2つの形（entry/changes 形式と values 形式）を吸収して返信イベントだけ取り出す */
export function extractReplyEvents(payload: any): ReplyEvent[] {
  const out: ReplyEvent[] = [];
  const take = (field: string, v: any, targetId?: string) => {
    if (field !== "replies" || !v?.id) return;
    out.push({ id: String(v.id), username: v.username, text: v.text, timestamp: v.timestamp, shortcode: v.shortcode,
      rootOwnerId: v.root_post?.owner_id ? String(v.root_post.owner_id) : targetId, rootPostId: v.root_post?.id ? String(v.root_post.id) : undefined, repliedToId: v.replied_to?.id ? String(v.replied_to.id) : undefined });
  };
  if (payload?.values) take(String(payload.values.field || ""), payload.values.value, payload.target_id ? String(payload.target_id) : undefined);
  for (const e of payload?.entry ?? []) for (const c of e?.changes ?? []) take(String(c.field || ""), c.value, e?.id ? String(e.id) : undefined);
  return out;
}

/** 返信イベント→LINEカード。自分の返信・meta.ai は除外 */
export async function handleReplyEvents(events: ReplyEvent[]): Promise<number> {
  let sent = 0;
  for (const ev of events) {
    try {
      if (!ev.rootOwnerId) continue;
      const d = await db.getDb(); if (!d) continue;
      const { sql } = await import("drizzle-orm");
      const acct: any = ((await d.execute(sql`SELECT id, userId, threadsUsername FROM threadsAccounts WHERE threadsUserId = ${ev.rootOwnerId} AND isActive = 1 LIMIT 1`)) as any)[0][0];
      if (!acct) continue;
      if (ev.username && (ev.username === acct.threadsUsername || /^meta\.ai$/i.test(ev.username))) continue;
      const full: any = await db.getThreadsAccountById(Number(acct.id));
      const targets = await db.getLineUserIdsForUser(Number(acct.userId));
      if (targets.length === 0) continue;
      let parentText: string | null = null;
      try { if (ev.rootPostId && full?.accessToken) { const r: any = await (await fetch(`https://graph.threads.net/v1.0/${ev.rootPostId}?fields=text&access_token=${full.accessToken}`)).json(); parentText = r?.text ?? null; } } catch { parentText = null; }
      const user: any = await db.getUserById(Number(acct.userId));
      const { draftCommentReply, buildCommentReplyCards } = await import("./commentReply");
      const draft = await draftCommentReply({ commentText: String(ev.text || ""), commenter: ev.username ?? null, parentText, storeName: user?.storeName ?? null });
      if (!draft) continue;
      const msgs = buildCommentReplyCards([{ accountId: Number(acct.id), accountUsername: String(acct.threadsUsername), hasReplyScope: !(full?.hasReplyScope === false || full?.hasReplyScope === 0), commentId: ev.id, shortcode: ev.shortcode ?? null, commenter: ev.username ?? null, commentText: String(ev.text || ""), parentText, draft }]);
      const { pushMessages } = await import("./lineNotify");
      for (const to of targets) await pushMessages(to, msgs);
      // 3時間おきの巡回と二重にならないよう、確認時刻を進める
      try { await db.updateUserLastCommentCheck(Number(acct.userId), new Date()); } catch { /* 無視 */ }
      sent++;
      console.log(`[ThreadsWebhook] reply → LINE user=${acct.userId} @${acct.threadsUsername} from=@${ev.username}`);
    } catch (e) {
      console.error("[ThreadsWebhook] handle failed:", e);
    }
  }
  return sent;
}

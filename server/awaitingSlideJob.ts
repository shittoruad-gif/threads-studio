/**
 * 承認待ちのまま予定時刻を過ぎた投稿を、その日の少し後ろへずらす（30分おき・7:00〜21:30 JST）。
 * 2026-09-11 三上様指示「現場に出ている先生は承認できないことが多い。承認できない場合は別の時刻にずらす」。
 * 以前は翌朝8時のリマインドでまとめて翌日へ繰り越していたため、当日中に承認しても出せなかった。
 *
 * 18:00 には、まだ承認待ちの投稿がある方へ「今日中に承認すれば今日公開できます」を1通（LINE。無ければメール）。
 */
import * as db from "./db";
import { textWithQuick } from "./lineChat";
import { slideOverdueTime } from "../shared/publishTiming";

export async function runAwaitingSlideJob(): Promise<void> {
  const overdue = await db.getOverdueAwaitingApprovalPosts();
  if (overdue.length === 0) { console.log("[AwaitingSlide] 対象なし"); return; }
  let moved = 0;
  for (const p of overdue) {
    try {
      const { at, label } = slideOverdueTime(Date.now());
      await db.updateScheduledPostTime(p.id, at);
      moved++;
      console.log(`[AwaitingSlide] post=${p.id} user=${p.userId} → ${label}`);
    } catch (e) {
      console.error(`[AwaitingSlide] post=${p.id} のずらしに失敗:`, e);
    }
  }
  console.log(`[AwaitingSlide] ${moved}/${overdue.length}件をずらした`);
}

export async function runEveningApprovalReminderJob(): Promise<void> {
  const d = await db.getDb();
  if (!d) return;
  const { sql } = await import("drizzle-orm");
  // 今日（JST）に予定があって、まだ承認されていない投稿（固定投稿の下書きは除く）
  const rows: any = ((await d.execute(sql`
    SELECT userId, COUNT(*) n FROM scheduledPosts
    WHERE status = 'awaiting_approval' AND (angle IS NULL OR angle <> 'pinned')
      AND DATE(CONVERT_TZ(scheduledAt,'+00:00','+09:00')) <= DATE(CONVERT_TZ(NOW(),'+00:00','+09:00'))
    GROUP BY userId`)) as any)[0] ?? [];
  if (rows.length === 0) { console.log("[EveningReminder] 対象なし"); return; }
  const { pushMessages } = await import("./lineNotify");
  let sent = 0;
  for (const r of rows) {
    const userId = Number(r.userId);
    const n = Number(r.n);
    try {
      const user: any = await db.getUserById(userId);
      if (!user || user.isDemoMode) continue;
      const lineIds = await db.getLineUserIdsForUser(userId);
      if (lineIds.length > 0) {
        const ok = await pushMessages(lineIds[0], [textWithQuick(
          `今日の投稿 ${n}件が、まだ承認待ちです。\n「今日の投稿」から「OK」を押していただくと、今日中に公開されます（21時を過ぎた分は明日の10時台に公開）。\n\nお手すきのときで大丈夫です。押されなかった分は、明日の10時台に回して改めてお届けします。`,
          [{ label: "今日の投稿", data: "m=posts" }, { label: `すべて承認する（${n}件）`, data: "a=okall" }],
        )]);
        if (ok) sent++;
      } else if (user.email) {
        const posts = (await db.getScheduledPostsByUserId(userId))
          .filter((p: any) => p.status === "awaiting_approval" && p.angle !== "pinned")
          .map((p: any) => ({ id: p.id, postContent: p.postContent, scheduledAt: p.scheduledAt }));
        if (posts.length > 0) {
          const { sendApprovalDigestEmail } = await import("./approvalEmail");
          await sendApprovalDigestEmail({ to: user.email, userId, posts, overdue: true });
          sent++;
        }
      }
    } catch (e) {
      console.error(`[EveningReminder] user=${userId} に失敗:`, e);
    }
  }
  console.log(`[EveningReminder] 送信 ${sent}件 / 対象 ${rows.length}人`);
}

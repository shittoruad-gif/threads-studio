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
    SELECT sp.userId, COUNT(*) n,
      (SELECT COUNT(*) FROM scheduledPosts p2 WHERE p2.userId = sp.userId AND p2.status = 'posted'
         AND DATE(CONVERT_TZ(p2.scheduledAt,'+00:00','+09:00')) = DATE(CONVERT_TZ(NOW(),'+00:00','+09:00'))) postedToday
    FROM scheduledPosts sp
    WHERE sp.status = 'awaiting_approval' AND (sp.angle IS NULL OR sp.angle <> 'pinned')
      AND sp.userId NOT IN (SELECT id FROM users WHERE autoPublishIfNoResponse = 1)
      AND DATE(CONVERT_TZ(sp.scheduledAt,'+00:00','+09:00')) <= DATE(CONVERT_TZ(NOW(),'+00:00','+09:00'))
    GROUP BY sp.userId`)) as any)[0] ?? [];
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
        const none = Number(r.postedToday ?? 0) === 0;
        const text =
          `今日の投稿 ${n}件が、まだ承認待ちです。` +
          (none ? "\n★いまの設定では、承認がないと投稿は公開されません。今日はまだ1件も公開されていません。" : "") +
          `\n「今日の投稿」から「OK」を押していただくと、今日中に公開されます（21時を過ぎた分は明日の10時台に公開）。\n\n` +
          `押す時間がない日が多い場合は、次のどちらかを選べます（「設定」からいつでも戻せます）。\n` +
          `・「見送りしなければ公開」：カードは届き、「見送る」を押さない限り予定時刻にそのまま公開されます\n` +
          `・「自動にする（確認なし）」：カードなしで、毎朝の投稿がそのまま公開されます`;
        const ok = await pushMessages(lineIds[0], [textWithQuick(text, [
          { label: "今日の投稿", data: "m=posts" },
          { label: `すべて承認する（${n}件）`, data: "a=okall" },
          { label: "見送りしなければ公開", data: "s=softappr&v=on" },
          { label: "自動にする（確認なし）", data: "c=automode&v=on" },
        ])]);
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

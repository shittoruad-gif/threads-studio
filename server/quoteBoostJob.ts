/**
 * 固定投稿の週1回の引用（2026-09-07 三上様指示：リポスト・引用は強い反応シグナル）。
 * 公開済みの固定投稿を、本人のアカウントから週1回「引用」して再露出する。自分の投稿の引用なので規約上も自然。
 *  - 対象：自動投稿ON・慣らし運転中でない・固定投稿がThreads上に公開済み・直近6日に引用していない
 *  - 予約：当日20:00〜20:20 JST（通常投稿の枠 15/21/22時 と重ねない）。承認モードは通常どおり
 *  - 追い投稿・計測コメントは付けない（angle=quote_pinned）
 */
import * as db from "./db";

const JST = 9 * 3600 * 1000;
export const QUOTE_PINNED_ANGLE = "quote_pinned";

const INTROS = [
  "はじめての方へ。うちのお店がどんなところかは、この投稿にまとめています。",
  "最近フォローしてくださった方へ。お店の紹介はこちらの投稿をどうぞ。",
  "どんなお店？と聞かれることが増えたので、改めてこちらを。",
  "初めての方が最初に読む用に、お店の入口の投稿です。",
];

export async function runQuoteBoostJob(): Promise<void> {
  const d = await db.getDb();
  if (!d) return;
  const { sql } = await import("drizzle-orm");
  const accts: any[] = ((await d.execute(sql`SELECT ta.id, ta.userId, ta.threadsUsername, ta.threadsUserId, ta.createdAt, ta.defaultProjectId, u.isDemoMode FROM threadsAccounts ta JOIN users u ON u.id = ta.userId WHERE ta.isActive = 1`)) as any)[0];
  const { rampForAccount } = await import("./accountRampCheck");
  const { effectiveAccountSettings } = await import("../shared/accountSettings");
  let made = 0;
  for (const a of accts) {
    try {
      if (a.isDemoMode) continue;
      const common = await db.getAutoPostSettings(Number(a.userId));
      const eff = effectiveAccountSettings(common as any, a);
      if (!eff.autoPostEnabled) continue;
      const full: any = await db.getThreadsAccountById(Number(a.id));
      const ramp = await rampForAccount(full, 3);
      if (ramp.capped) continue; // 慣らし運転中は増やさない
      // 公開済みの固定投稿（最新）
      const pinned: any = ((await d.execute(sql`SELECT id, projectId, publishedThreadsPostId FROM scheduledPosts WHERE threadsAccountId = ${Number(a.id)} AND angle = 'pinned' AND status = 'posted' AND publishedThreadsPostId IS NOT NULL ORDER BY postedAt DESC LIMIT 1`)) as any)[0][0];
      if (!pinned?.publishedThreadsPostId) continue;
      const recent: any = ((await d.execute(sql`SELECT COUNT(*) n FROM scheduledPosts WHERE threadsAccountId = ${Number(a.id)} AND angle = ${QUOTE_PINNED_ANGLE} AND status IN ('posted','pending','awaiting_approval','processing') AND scheduledAt >= NOW() - INTERVAL 6 DAY`)) as any)[0][0];
      if (Number(recent?.n ?? 0) > 0) continue;
      // 固定投稿がThreads上に残っているか（消えていれば引用しない）
      const chk: any = await (await fetch(`https://graph.threads.net/v1.0/${pinned.publishedThreadsPostId}?fields=id&access_token=${full.accessToken}`)).json();
      if (chk?.error) { console.log(`[QuoteBoost] pinned post missing @${a.threadsUsername}`); continue; }
      const nowJst = new Date(Date.now() + JST);
      const slot = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate(), 20, Math.floor(Math.random() * 20)) - JST);
      if (slot.getTime() < Date.now() + 10 * 60 * 1000) continue; // 今日の20時を過ぎていたら来週
      const text = INTROS[Math.floor(Date.now() / 86400000) % INTROS.length];
      await db.createScheduledPost({
        userId: Number(a.userId), projectId: pinned.projectId, threadsAccountId: Number(a.id), scheduledAt: slot,
        postContent: text, status: eff.autoPostRequireApproval ? "awaiting_approval" : "pending", source: "auto",
        angle: QUOTE_PINNED_ANGLE, quotePostId: String(pinned.publishedThreadsPostId),
      } as any);
      made++;
      console.log(`[QuoteBoost] 予約 @${a.threadsUsername} at ${new Date(slot.getTime() + JST).toISOString().slice(11, 16)}JST quote=${pinned.publishedThreadsPostId}`);
    } catch (e) {
      console.error(`[QuoteBoost] account ${a.id} failed:`, e);
    }
  }
  console.log(`[QuoteBoost] 完了 予約=${made}件`);
}

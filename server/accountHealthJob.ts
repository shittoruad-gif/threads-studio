/**
 * アカウント健全性の日次点検（毎朝6:40 JST・自動投稿の前）。2026-09-06 梅原様の停止を受けて。
 *  1. 各アカウントのトークンで /me を叩き、制限・停止のエラーなら自動投稿を止めて本人と運営に通知
 *  2. 直近3日に公開した投稿がThreads上から消えていないか（スパム判定で消される兆候）を見る。2件以上消えていたら運営と本人に通知
 */
import * as db from "./db";
import { classifyThreadsError, restrictionNoticeForUser } from "../shared/accountRestriction";

const THREADS = "https://graph.threads.net/v1.0";

export async function runAccountHealthJob(): Promise<void> {
  const d = await db.getDb();
  if (!d) return;
  const { sql } = await import("drizzle-orm");
  const rows: any = await d.execute(sql`SELECT id, userId, threadsUsername FROM threadsAccounts WHERE isActive = 1`);
  const accounts: any[] = (rows as any)[0] ?? [];
  const { notifyOwner } = await import("./_core/notification");
  const { pushMessages } = await import("./lineNotify");
  let restricted = 0, missing = 0;
  for (const a of accounts) {
    try {
      const acct: any = await db.getThreadsAccountById(Number(a.id)); // トークンは復号済み
      if (!acct?.accessToken) continue;
      const me: any = await (await fetch(`${THREADS}/me?fields=id,username&access_token=${acct.accessToken}`)).json();
      if (me?.error) {
        const kind = classifyThreadsError(JSON.stringify(me.error));
        if (kind === "restricted") {
          restricted++;
          await db.updateThreadsAccount(Number(a.id), { autoPostEnabled: false } as any);
          const targets = await db.getLineUserIdsForUser(Number(a.userId));
          for (const to of targets) await pushMessages(to, [{ type: "text", text: restrictionNoticeForUser(String(a.threadsUsername)) }]);
          await notifyOwner({ title: "Threadsアカウントに制限の兆候（自動投稿を停止）", content: `@${a.threadsUsername}（user ${a.userId}）\n${JSON.stringify(me.error).slice(0, 300)}` });
          console.warn(`[AccountHealth] restricted @${a.threadsUsername}: ${JSON.stringify(me.error).slice(0, 200)}`);
        } else {
          console.log(`[AccountHealth] @${a.threadsUsername} me error (${kind}): ${JSON.stringify(me.error).slice(0, 160)}`);
        }
        continue;
      }
      // 直近3日の公開投稿がThreads上に残っているか
      const pr: any = await d.execute(sql`SELECT publishedThreadsPostId FROM scheduledPosts WHERE threadsAccountId = ${Number(a.id)} AND status = 'posted' AND postedAt >= NOW() - INTERVAL 3 DAY AND publishedThreadsPostId IS NOT NULL ORDER BY postedAt DESC LIMIT 8`);
      const ids: string[] = ((pr as any)[0] ?? []).map((r: any) => String(r.publishedThreadsPostId));
      let gone = 0;
      for (const id of ids) {
        const p: any = await (await fetch(`${THREADS}/${id}?fields=id&access_token=${acct.accessToken}`)).json();
        if (p?.error && /does not exist|cannot be loaded|unsupported get request/i.test(JSON.stringify(p.error))) gone++;
      }
      if (gone >= 2) {
        missing++;
        await notifyOwner({ title: "公開した投稿がThreads上から消えています（スパム判定の可能性）", content: `@${a.threadsUsername}（user ${a.userId}）直近3日の公開 ${ids.length}件のうち ${gone}件が見つかりません。投稿密度・表現の見直しを。` });
        const targets = await db.getLineUserIdsForUser(Number(a.userId));
        for (const to of targets) await pushMessages(to, [{ type: "text", text: `@${a.threadsUsername} で最近公開した投稿のうち${gone}件が、Threads上から消えています。Threads側の自動判定で消された可能性があります。しばらくは投稿を控えめにし、価格や結果の表現は避けてください。運営でも内容を確認します。` }]);
        console.warn(`[AccountHealth] @${a.threadsUsername}: ${gone}/${ids.length} posts missing`);
      }
    } catch (e) {
      console.error(`[AccountHealth] account ${a.id} check failed:`, e);
    }
  }
  console.log(`[AccountHealth] 完了 accounts=${accounts.length} restricted=${restricted} missingAlerts=${missing}`);
}

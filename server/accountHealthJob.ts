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
      const me: any = await (await fetch(`${THREADS}/me?fields=id,username,threads_profile_picture_url,threads_biography&access_token=${acct.accessToken}`)).json();
      // ★プロフィールの保存値を毎朝新しくする。8:30の「次にやること」が古い自己紹介（空）で
      //   誤って「自己紹介を整えて」と送っていた（2026-09-07 梅原様）。
      if (!me?.error && me?.username) {
        await db.updateThreadsAccountProfile(Number(a.id), {
          threadsUsername: String(me.username),
          profilePictureUrl: me.threads_profile_picture_url || undefined,
          biography: typeof me.threads_biography === "string" ? me.threads_biography : undefined,
        }).catch(() => undefined);
      }
      if (me?.error) {
        const kind = classifyThreadsError(JSON.stringify(me.error));
        if (kind === "restricted") {
          restricted++;
          await db.updateThreadsAccount(Number(a.id), { autoPostEnabled: false } as any);
          const targets = await db.getLineUserIdsForUser(Number(a.userId));
          for (const to of targets) await pushMessages(to, [{ type: "text", text: restrictionNoticeForUser(String(a.threadsUsername)) }]);
          try { const { notifyAgencyOfClientIssue } = await import("./agencyReportJob"); await notifyAgencyOfClientIssue(Number(a.userId), `@${a.threadsUsername} に制限の兆候があり、自動投稿を止めました。ご本人にもLINEでお知らせ済みです。本人確認や異議申立が終わり次第、再開できます。`); } catch { /* 代理店なしなら何もしない */ }
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
      let gone = 0; const goneIds: string[] = [];
      for (const id of ids) {
        const p: any = await (await fetch(`${THREADS}/${id}?fields=id&access_token=${acct.accessToken}`)).json();
        if (p?.error && /does not exist|cannot be loaded|unsupported get request/i.test(JSON.stringify(p.error))) { gone++; goneIds.push(id); }
      }
      // ★消えた投稿は「失敗（Threads側で削除）」として記録し、翌日以降に同じ警告を繰り返さない
      //   （2026-09-09 比嘉様に3日連続で「投稿が消えています」が届いた）
      if (goneIds.length > 0) {
        // ★消された投稿が1件でもあれば7日間の冷却期間に入れる（1日1件・自己返信とリンクコメントなし）
        const { COOLDOWN_DAYS, jstDateString } = await import("../shared/accountRamp");
        const { deletedPostsNotice, dateJstLabel } = await import("../shared/dailyCap");
        const until = jstDateString(COOLDOWN_DAYS);
        // 自社アカウント（しっとる公式・Moveact＝user 78）は補填しない（2026-09-13 R6）
        const isOwnAccount = Number(a.userId) === 78;
        try {
          await db.updateThreadsAccount(Number(a.id), { cooldownUntil: until } as any);
          console.warn(`[AccountHealth] @${a.threadsUsername} を冷却期間に（${COOLDOWN_DAYS}日・1日1件）`);
        } catch { /* 記録できなくても点検は続ける */ }
        try { await d.execute(sql`UPDATE scheduledPosts SET status = 'failed', errorMessage = 'Threads側で削除された（健全性点検で検知・スパム判定の可能性）' WHERE threadsAccountId = ${Number(a.id)} AND status = 'posted' AND publishedThreadsPostId IN (${sql.join(goneIds.map((g) => sql`${g}`), sql`, `)})`); } catch (e) { console.warn(`[AccountHealth] mark removed failed:`, (e as Error)?.message); }
        // ★R6：消えた分を補填に積む（冷却明けから1日＋1件で返す）
        if (!isOwnAccount) { try { await db.addDeletedShortfall(Number(a.id), gone); } catch (e) { console.warn(`[AccountHealth] deletedShortfall failed:`, (e as Error)?.message); } }
        // ★R5：冷却に入った日は、その日すでに作ってある予定も1件に絞る（残りは翌日の同じ時刻へ）
        let deferred = 0;
        try { deferred = await db.deferTodaysAutoPostsBeyond(Number(a.id), 1); } catch (e) { console.warn(`[AccountHealth] defer failed:`, (e as Error)?.message); }
        missing++;
        try { const { notifyAgencyOfClientIssue } = await import("./agencyReportJob"); await notifyAgencyOfClientIssue(Number(a.userId), `@${a.threadsUsername} で最近公開した投稿のうち${gone}件がThreads上から消えています（スパム判定の可能性）。${dateJstLabel(until)}まで自動投稿を1日1件に抑え、減った分と消えた分はその後に1日1件ずつ補填します。`); } catch { /* 代理店なし */ }
        await notifyOwner({ title: "公開した投稿がThreads上から消えています（スパム判定の可能性）", content: `@${a.threadsUsername}（user ${a.userId}）直近3日の公開 ${ids.length}件のうち ${gone}件が見つかりません。${dateJstLabel(until)}まで1日1件に抑え、今日の残り${deferred}件を翌日へ送りました。${isOwnAccount ? "自社アカウントのため補填なし。" : `消えた${gone}件は冷却明けから1日1件ずつ補填します。`}お客様へは定型文でお知らせ済み（R5）。` });
        // ★R5：検知した当日に、承諾済みの定型文でお客様へ（2026-09-13 三上様決定。文面は shared/dailyCap.ts deletedPostsNotice）
        if (!isOwnAccount) {
          const targets = await db.getLineUserIdsForUser(Number(a.userId));
          for (const to of targets) await pushMessages(to, [{ type: "text", text: deletedPostsNotice(String(a.threadsUsername), gone, dateJstLabel(until)) }]);
        }
        console.warn(`[AccountHealth] @${a.threadsUsername}: ${gone}/${ids.length} posts missing（冷却〜${until}・翌日へ${deferred}件）`);
      }
    } catch (e) {
      console.error(`[AccountHealth] account ${a.id} check failed:`, e);
    }
  }
  console.log(`[AccountHealth] 完了 accounts=${accounts.length} restricted=${restricted} missingAlerts=${missing}`);
}

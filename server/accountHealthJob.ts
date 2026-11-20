/**
 * アカウント健全性の日次点検（毎朝6:40 JST・自動投稿の前）。2026-09-06 梅原様の停止を受けて。
 *  1. 各アカウントのトークンで /me を叩き、制限・停止のエラーなら自動投稿を止めて本人と運営に通知
 *  2. 直近3日に公開した投稿がThreads上から消えていないかを見る。お客様のアカウントは記録して運営にだけ通知（本数は変えない・2026-11-20）。
 *     自社アカウントだけ、今までどおり7日間の冷却に入れる
 *  3. 表示回数が以前の2割を切っていないか（公開できているのに表示されない状態）を見る。運営に通知する（本数は変えない・2026-11-11）
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
      // ★ご契約が終わった方には点検のお知らせ（消えた投稿・補填・制限）を送らない（2026-10-03）
      if (await db.isEndedCustomer(Number(a.userId))) continue;
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
        const { COOLDOWN_DAYS, jstDateString } = await import("../shared/accountRamp");
        const { dateJstLabel } = await import("../shared/dailyCap");
        const until = jstDateString(COOLDOWN_DAYS);
        // 自社アカウント（しっとる公式・Moveact＝user 78）は補填しない（2026-09-13 R6）
        const isOwnAccount = Number(a.userId) === 78;

        // ★お客様のアカウントでは、投稿が見つからなくなっても本数を変えない（2026-11-20 三上様
        //   「クライアントが自分で投稿が微妙だと思って削除したときに、勝手に消されたと思って投稿数を勝手に減らす仕組みをやめて」）。
        //   点検は「見つからない」ことしか分からず、ご本人が消したのか Meta が消したのかを区別できない。
        //   これまでは1件でも7日間1日1件に抑え、その日の残りも翌日へ送っていた（ご本人が消しただけの方の本数が減っていた）。
        //   いまは記録して運営にだけ知らせる。冷却・翌日送り・補填・お客様へのお知らせは、どれも自動では行わない。
        //   制限・停止の兆候（上の /me のエラー）で自動投稿を止める守りは変えていない。
        if (!isOwnAccount) {
          try { await d.execute(sql`UPDATE scheduledPosts SET status = 'failed', errorMessage = 'Threads上で見つからない（ご本人が消した可能性・本数は変えていない）' WHERE threadsAccountId = ${Number(a.id)} AND status = 'posted' AND publishedThreadsPostId IN (${sql.join(goneIds.map((g) => sql`${g}`), sql`, `)})`); } catch (e) { console.warn(`[AccountHealth] mark missing failed:`, (e as Error)?.message); }
          missing++;
          await notifyOwner({ title: `公開した投稿が${gone}件見つかりません（本数は変えていません）`, content: `@${a.threadsUsername}（user ${a.userId}）直近3日の公開 ${ids.length}件のうち ${gone}件が Threads 上で見つかりません。ご本人が消された可能性があるため、本数は変えず、お客様へのお知らせもしていません（2026-11-20）。${gone >= 2 ? "一度に2件以上です。" : ""}短い間に続くとき・ご本人に心当たりが無いときは Meta 側の削除の可能性があるので、本数を抑えるかどうかを手で判断してください。` });
          console.warn(`[AccountHealth] @${a.threadsUsername}: ${gone}/${ids.length} posts missing（本数は変えない・運営にだけ通知）`);
          continue;
        }
        // ── ここから下は自社アカウントだけ（1日の本数が多い学習用を守るため、今までどおり冷却に入れる） ──
        try {
          await db.updateThreadsAccount(Number(a.id), { cooldownUntil: until } as any);
          console.warn(`[AccountHealth] @${a.threadsUsername} を冷却期間に（${COOLDOWN_DAYS}日・1日1件）`);
        } catch { /* 記録できなくても点検は続ける */ }
        try { await d.execute(sql`UPDATE scheduledPosts SET status = 'failed', errorMessage = 'Threads側で削除された（健全性点検で検知・スパム判定の可能性）' WHERE threadsAccountId = ${Number(a.id)} AND status = 'posted' AND publishedThreadsPostId IN (${sql.join(goneIds.map((g) => sql`${g}`), sql`, `)})`); } catch (e) { console.warn(`[AccountHealth] mark removed failed:`, (e as Error)?.message); }
        // ★R5：冷却に入った日は、その日すでに作ってある予定も1件に絞る（残りは翌日の同じ時刻へ）
        let deferred = 0;
        try { deferred = await db.deferTodaysAutoPostsBeyond(Number(a.id), 1); } catch (e) { console.warn(`[AccountHealth] defer failed:`, (e as Error)?.message); }
        missing++;
        await notifyOwner({ title: "自社アカウントで公開した投稿がThreads上から消えています（冷却に入れました）", content: `@${a.threadsUsername}（user ${a.userId}）直近3日の公開 ${ids.length}件のうち ${gone}件が見つかりません。${dateJstLabel(until)}まで1日1件に抑え、今日の残り${deferred}件を翌日へ送りました。自社アカウントのため補填なし。` });
        console.warn(`[AccountHealth] @${a.threadsUsername}: ${gone}/${ids.length} posts missing（冷却〜${until}・翌日へ${deferred}件）`);
      }
    } catch (e) {
      console.error(`[AccountHealth] account ${a.id} check failed:`, e);
    }
  }
  let reachAlerts = 0;
  try { reachAlerts = await checkReachCollapse(accounts); } catch (e) { console.error(`[AccountHealth] reach check failed:`, e); }
  console.log(`[AccountHealth] 完了 accounts=${accounts.length} restricted=${restricted} missingAlerts=${missing} reachAlerts=${reachAlerts}`);
}

/**
 * 3. 表示回数の急な落ち込み（判定は shared/reachCollapse.ts・2026-11-11）。
 *    投稿は公開できているのに表示されなくなったアカウントを見つけ、運営に知らせる。知らせるだけで、本数は変えない。
 *    ★はじめは「1日1件に絞る」まで自動でしていたが、同じ日に外した（2026-11-11）。実データ（86日・231週）では
 *      1投稿あたりの表示は本数と関係がなく（順位相関 −0.09）、本数を減らすと週の合計の表示が減るだけだった。
 *      急に落ちた4件も、落ちる前に本数が増えていたのは1件だけ。絞るかどうかは、知らせを見て運営が1件ずつ決める。
 *    同じアカウントの知らせは7日に1回まで（jobRuns に reachAlert:<id> として残す）。
 *    お客様へは自動では何も送らない。
 */
export const REACH_ALERT_EVERY_DAYS = 7;

export async function checkReachCollapse(accounts: Array<{ id: number; userId: number; threadsUsername: string }>): Promise<number> {
  const d = await db.getDb();
  if (!d || accounts.length === 0) return 0;
  const { sql } = await import("drizzle-orm");
  const { judgeReachCollapse, reachCollapseOwnerText, REACH_PRIOR_FROM_DAYS, REACH_RECENT_FROM_DAYS, REACH_RECENT_TO_DAYS } = await import("../shared/reachCollapse");
  const { notifyOwner } = await import("./_core/notification");
  const rr: any = await d.execute(sql`SELECT threadsAccountId AS a, impressions AS i,
      (postedAt >= NOW() - INTERVAL ${REACH_RECENT_FROM_DAYS} DAY) AS recent
    FROM postAnalytics
    WHERE threadsAccountId IS NOT NULL AND postedAt >= NOW() - INTERVAL ${REACH_PRIOR_FROM_DAYS} DAY AND postedAt < NOW() - INTERVAL ${REACH_RECENT_TO_DAYS} DAY`);
  const by = new Map<number, { recent: number[]; prior: number[] }>();
  for (const r of ((rr as any)[0] ?? []) as any[]) {
    const k = Number(r.a);
    if (!by.has(k)) by.set(k, { recent: [], prior: [] });
    (Number(r.recent) ? by.get(k)!.recent : by.get(k)!.prior).push(Number(r.i) || 0);
  }
  let alerts = 0;
  for (const a of accounts) {
    try {
      const g = by.get(Number(a.id));
      if (!g) continue;
      const j = judgeReachCollapse(g.recent, g.prior);
      if (!j.collapsed) continue;
      if (await db.isEndedCustomer(Number(a.userId))) continue;
      const jobName = `reachAlert:${Number(a.id)}`;
      const seen: any = await d.execute(sql`SELECT 1 FROM jobRuns WHERE jobName = ${jobName} AND lastRunAt >= NOW() - INTERVAL ${REACH_ALERT_EVERY_DAYS} DAY LIMIT 1`);
      if ((((seen as any)[0] ?? []) as any[]).length > 0) continue;
      await d.execute(sql`INSERT INTO jobRuns (jobName, lastRunAt, lastStatus) VALUES (${jobName}, NOW(), 'success')
        ON DUPLICATE KEY UPDATE lastRunAt = NOW(), lastStatus = 'success', lastError = NULL`);
      alerts++;
      await notifyOwner({ title: "表示回数が急に落ちています", content: reachCollapseOwnerText({ username: String(a.threadsUsername), userId: Number(a.userId) }, j) });
      console.warn(`[AccountHealth] @${a.threadsUsername}: 表示の中央値 ${j.priorMedian}→${j.recentMedian}（運営に通知）`);
    } catch (e) {
      console.error(`[AccountHealth] account ${a.id} reach check failed:`, e);
    }
  }
  return alerts;
}

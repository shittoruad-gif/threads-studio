/**
 * 動いていないお客様のフォロー（2026-09-25 三上様指示・DB／LINE側）。判断と文面は shared/clientFollowup.ts。
 *
 * 毎日11:00（JST）に動く。ご契約中（有料）のお客様ごとに
 *   1. いまの工程（detectNextAction）と、いつからその工程のままかを clientStallState に記録
 *   2. 「投稿が出ない工程のまま3日」または「設定は終わっているのに3日公開ゼロ」なら
 *      三上様の公式LINEへ「事実のまとめ＋お客様へ送る文の案」を送る（同じ方へは3日あける）
 *   3. 三上様が「この文で送る」を押したものだけ、お客様のLINEへ届ける
 *
 * ★お客様へ自動では送らない（相手に届く送信は都度三上様の承諾を得る）。
 * ★冷却期間・公開の失敗など、お客様の操作では直らないものは、送る文を作らず三上様への報告だけにする。
 */
import { sql } from "drizzle-orm";
import * as db from "./db";
import { detectNextAction } from "./nextAction";
import {
  OPS_IGNORE_USER_IDS, REPROPOSE_DAYS, SILENT_DAYS, adminCard, decideStall, draftMessage, needsInternalFixOnly,
  type SilentCause,
} from "@shared/clientFollowup";

const JST = 9 * 3600_000;
const jstDate = (d: Date | string | null | undefined) => (d ? new Date(new Date(d).getTime() + JST).toISOString().slice(0, 10) : null);
const daysSince = (d: Date | string | null | undefined) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400_000) : null);

async function one<T = any>(q: ReturnType<typeof sql>): Promise<T | undefined> {
  const database = await db.getDb();
  if (!database) return undefined;
  const rows: any = await database.execute(q);
  return ((rows as any)[0] ?? [])[0];
}

async function adminLineIds(): Promise<string[]> {
  const database = await db.getDb();
  if (!database) return [];
  const rows: any = await database.execute(sql`SELECT id FROM users WHERE role = 'admin'`);
  const ids: string[] = [];
  for (const r of ((rows as any)[0] ?? []) as any[]) ids.push(...(await db.getLineUserIdsForUser(Number(r.id)).catch(() => [])));
  return Array.from(new Set(ids));
}

/**
 * 工程が変わっていれば「いつから」を今にし直し、そのままなら据え置く。
 * 返り値は、その工程のままの日数とその開始日。
 */
export async function refreshStallState(userId: number, stepKey: string): Promise<{ days: number; since: Date }> {
  const database = await db.getDb();
  if (!database) return { days: 0, since: new Date() };
  const cur: any = await one(sql`SELECT stepKey, stepSince FROM clientStallState WHERE userId = ${userId}`);
  if (!cur) {
    await database.execute(sql`INSERT INTO clientStallState (userId, stepKey) VALUES (${userId}, ${stepKey})`);
    return { days: 0, since: new Date() };
  }
  if (cur.stepKey !== stepKey) {
    await database.execute(sql`UPDATE clientStallState SET stepKey = ${stepKey}, stepSince = CURRENT_TIMESTAMP WHERE userId = ${userId}`);
    return { days: 0, since: new Date() };
  }
  return { days: daysSince(cur.stepSince) ?? 0, since: new Date(cur.stepSince) };
}

/** 公開ゼロの理由（事実から。推測はしない） */
async function silentCauseOf(userId: number): Promise<{ cause: SilentCause; detail: string | null }> {
  const r: any = await one(sql`
    SELECT
      SUM(CASE WHEN status = 'canceled' AND errorMessage LIKE '承認されないまま日をまたいだ%' THEN 1 ELSE 0 END) AS expired,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      MAX(CASE WHEN status = 'failed' THEN errorMessage END) AS lastError
    FROM scheduledPosts
    WHERE userId = ${userId} AND scheduledAt >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(SILENT_DAYS))} DAY)`);
  const cool: any = await one(sql`SELECT COUNT(*) AS n FROM threadsAccounts WHERE userId = ${userId} AND isActive = 1 AND cooldownUntil >= CURDATE()`);
  if (Number(cool?.n ?? 0) > 0) return { cause: "cooldown", detail: null };
  if (Number(r?.expired ?? 0) > 0) return { cause: "approval", detail: `承認されないまま見送りになった投稿 ${Number(r.expired)}件（直近${SILENT_DAYS}日）` };
  if (Number(r?.failed ?? 0) > 0) return { cause: "failed", detail: `失敗 ${Number(r.failed)}件：${String(r.lastError ?? "").slice(0, 60)}` };
  return { cause: "unknown", detail: null };
}

export interface FollowupTarget {
  userId: number;
  userName: string;
  planName: string;
  proSupport: boolean;
  reason: "setup" | "silent";
  stepKey: string | null;
  accountName: string | null;
  days: number;
  stepSince: string | null;
  lastPostedAt: string | null;
  lastLineActiveDays: number | null;
  silentCause?: SilentCause;
  silentDetail?: string | null;
}

/** 止まっているお客様を洗い出す（clientStallState の更新も兼ねる） */
export async function listStalledClients(): Promise<FollowupTarget[]> {
  const database = await db.getDb();
  if (!database) return [];
  const { getPlan, resolveEffectivePlanId } = await import("@shared/plans");
  const { isInternalAccount } = await import("./opsDigestJob");
  const users: any[] = await db.getAllUsers().catch(() => [] as any[]);
  const out: FollowupTarget[] = [];
  for (const u of users) {
    try {
      if (isInternalAccount(u) || u.role === "admin" || OPS_IGNORE_USER_IDS.has(Number(u.id))) continue;
      const sub: any = await db.getSubscriptionByUserId(u.id).catch(() => null);
      const plan = getPlan(resolveEffectivePlanId(sub?.planId, sub?.status));
      if (!plan || plan.priceMonthly <= 0) continue; // ご契約中の方だけ

      const action = await detectNextAction(u.id).catch(() => null);
      const stepKey = action && action.key !== "approval_off" ? action.key : null;
      const st = await refreshStallState(u.id, stepKey ?? "ok");

      const acc: any = await one(sql`SELECT COUNT(*) AS n, MIN(createdAt) AS first FROM threadsAccounts WHERE userId = ${u.id} AND isActive = 1`);
      const posts: any = await one(sql`
        SELECT SUM(CASE WHEN postedAt >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(SILENT_DAYS))} DAY) THEN 1 ELSE 0 END) AS recent,
               MAX(postedAt) AS last
        FROM scheduledPosts WHERE userId = ${u.id} AND status = 'posted'`);
      const decision = decideStall({
        stepKey, stepDays: st.days,
        hasAccount: Number(acc?.n ?? 0) > 0,
        postedRecent: Number(posts?.recent ?? 0),
        daysSinceLastPost: daysSince(posts?.last),
        daysSinceConnect: daysSince(acc?.first),
      });
      if (!decision) continue;

      const line: any = await one(sql`SELECT MAX(lastActiveAt) AS m FROM userLineLinks WHERE userId = ${u.id}`);
      const t: FollowupTarget = {
        userId: u.id, userName: String(u.name || u.email || `#${u.id}`), planName: String(plan.name),
        proSupport: Number(plan.features?.maxAutoPostsPerDay ?? 0) >= 3,
        reason: decision.reason, stepKey, accountName: (action as any)?.accountName ?? null, days: decision.days,
        stepSince: jstDate(st.since), lastPostedAt: jstDate(posts?.last), lastLineActiveDays: daysSince(line?.m),
      };
      if (decision.reason === "silent") {
        const c = await silentCauseOf(u.id);
        t.silentCause = c.cause; t.silentDetail = c.detail;
      }
      out.push(t);
    } catch (e) {
      console.error(`[ClientFollowup] user=${u.id} の判定に失敗:`, (e as Error)?.message);
    }
  }
  return out;
}

/** 毎日11:00：止まっているお客様ごとに、三上様へ事実＋送る文の案を届ける */
export async function runClientFollowup(opts: { dryRun?: boolean } = {}): Promise<{ checked: number; proposed: number; messages: string[] }> {
  const database = await db.getDb();
  if (!database) return { checked: 0, proposed: 0, messages: [] };
  const targets = await listStalledClients();
  const admins = opts.dryRun ? [] : await adminLineIds();
  const messages: string[] = [];
  let proposed = 0;

  for (const t of targets) {
    try {
      // 判断待ちがある、または REPROPOSE_DAYS 日以内に案を出していれば出し直さない
      const recent: any = await one(sql`
        SELECT COUNT(*) AS n FROM clientFollowups WHERE userId = ${t.userId}
          AND (status = 'pending' OR createdAt >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(REPROPOSE_DAYS))} DAY))`);
      if (Number(recent?.n ?? 0) > 0) continue;
      const prev: any = await one(sql`
        SELECT COUNT(*) AS n, MAX(decidedAt) AS last FROM clientFollowups
        WHERE userId = ${t.userId} AND status = 'sent' AND reason = ${t.reason} AND (stepKey <=> ${t.stepKey})`);
      const level = Number(prev?.n ?? 0) + 1;

      const card = adminCard({ ...t, level, lastSentAt: jstDate(prev?.last) });
      const internalOnly = needsInternalFixOnly({ reason: t.reason, silentCause: t.silentCause });
      const draft = internalOnly ? "" : draftMessage({
        userName: t.userName, reason: t.reason, stepKey: t.stepKey, accountName: t.accountName,
        days: t.days, level, proSupport: t.proSupport, silentCause: t.silentCause,
      });
      messages.push(card + (draft ? `\n────\n${draft}` : "\n（お客様の操作では直らないため、送る文は作っていません。運営側で確認してください）"));
      if (opts.dryRun) continue;

      const ins: any = await database.execute(sql`
        INSERT INTO clientFollowups (userId, reason, stepKey, daysStalled, level, message, status)
        VALUES (${t.userId}, ${t.reason}, ${t.stepKey}, ${t.days}, ${level}, ${draft || card}, ${internalOnly ? "skipped" : "pending"})`);
      const id = Number((ins as any)[0]?.insertId ?? 0);

      const { pushMessages } = await import("./lineNotify");
      const { textWithQuick } = await import("./lineChat");
      const msgs: unknown[] = internalOnly
        ? [{ type: "text", text: `${card}\n\n（お客様の操作では直らないため、送る文は作っていません。運営側で確認してください）` }]
        : [
            { type: "text", text: `${card}\n\n次の文でお客様にお送りしますか？（押すまで送りません）` },
            textWithQuick(draft, [
              { label: "この文で送る", data: `adm=cf&id=${id}&v=send` },
              { label: "送らない", data: `adm=cf&id=${id}&v=skip` },
            ]),
          ];
      for (const lineId of admins) await pushMessages(lineId, msgs);
      proposed++;
      console.log(`[ClientFollowup] user=${t.userId} ${t.reason} ${t.stepKey ?? ""} ${t.days}日 → 案 #${id}（${level}回目）`);
    } catch (e) {
      console.error(`[ClientFollowup] user=${t.userId} の案の作成に失敗:`, (e as Error)?.message);
    }
  }
  return { checked: targets.length, proposed, messages };
}

/** 三上様が押した「この文で送る／送らない」を反映する。返り値は三上様へお返しする文 */
export async function decideFollowup(id: number, action: "send" | "skip", adminUserId: number): Promise<string> {
  const database = await db.getDb();
  if (!database) return "いまは処理できませんでした。";
  const row: any = await one(sql`SELECT * FROM clientFollowups WHERE id = ${id} LIMIT 1`);
  if (!row) return "その案が見つかりませんでした。";
  if (row.status !== "pending") return `この案はすでに「${row.status === "sent" ? "送信ずみ" : "送らない"}」になっています。`;

  if (action === "skip") {
    await database.execute(sql`UPDATE clientFollowups SET status = 'skipped', decidedAt = NOW(), decidedBy = ${adminUserId} WHERE id = ${id}`);
    return "送らずにおきました。3日後も止まっていれば、また事実をお知らせします。";
  }

  const targets = await db.getLineUserIdsForUser(Number(row.userId)).catch(() => [] as string[]);
  if (targets.length === 0) return "このお客様は公式LINEがつながっていないため、送れませんでした（メールや電話でのご連絡をご検討ください）。";

  // ボタン：設定の工程はその工程のボタン（いまの状態で作り直す）、公開ゼロは「今日の投稿」
  let buttons: { label: string; data: string }[] = [];
  if (row.reason === "setup") {
    const action = await detectNextAction(Number(row.userId)).catch(() => null);
    if (!action) {
      await database.execute(sql`UPDATE clientFollowups SET status = 'skipped', decidedAt = NOW(), decidedBy = ${adminUserId} WHERE id = ${id}`);
      return "このお客様は、すでに次の工程に進まれていたため送りませんでした。";
    }
    buttons = (action.buttons ?? []).slice(0, 3);
  } else {
    buttons = [{ label: "今日の投稿", data: "m=posts" }];
  }
  const { pushMessages } = await import("./lineNotify");
  const { textWithQuick } = await import("./lineChat");
  let ok = 0;
  for (const to of targets) if (await pushMessages(to, [textWithQuick(String(row.message), buttons)])) ok++;
  await database.execute(sql`UPDATE clientFollowups SET status = ${ok > 0 ? "sent" : "pending"}, decidedAt = NOW(), decidedBy = ${adminUserId} WHERE id = ${id}`);
  return ok > 0 ? `お送りしました（${ok}件のLINEへ）。` : "送信に失敗しました。少し時間をおいてもう一度押してください。";
}

/** 毎日の定例（11:00 JST） */
export async function runClientFollowupJob(): Promise<void> {
  const r = await runClientFollowup();
  console.log(`[ClientFollowup] 止まっている方 ${r.checked}名・三上様へ ${r.proposed}件の案`);
}

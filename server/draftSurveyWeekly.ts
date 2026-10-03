/**
 * 案の◯✕アンケートを週1回の定例に（2026-09-29 三上様指示「まずは型Bを定期的に行うように」）。
 * 判断は shared/draftSurveyWeekly.ts。
 *
 * 毎週月曜11:30（JST）：
 *   1. 型B（直近7日に3回以上見送り・自動投稿の公開が1件以上）のアカウントごとに、切り口の違う8案を作る
 *      （通常の生成と同じ検査をすべて通す。投稿にはしない）
 *   2. 三上様の公式LINEへ下見（全文）を「この8案を送る／今回は送らない」ボタン付きで送る
 *   3. 三上様が「この8案を送る」を押したものだけ、お客様のLINEへ届く（server/draftSurvey.ts の◯✕カード）
 *
 * ★お客様へは自動で送らない。押されなかった案は、翌週の案に置き換わる（expired）。
 */
import { sql } from "drizzle-orm";
import * as db from "./db";
import { WEEKLY_SURVEY, SURVEY_ANGLE_POOL, isWeeklySurveyTarget, surveyAngleOrder, surveyIntro, adminPreviewText } from "@shared/draftSurveyWeekly";
import { FOLLOWUP_MIN_DECLINES } from "@shared/declineFollowup";

async function adminLineIds(): Promise<string[]> {
  const database = await db.getDb();
  if (!database) return [];
  const rows: any = await database.execute(sql`SELECT id FROM users WHERE role = 'admin'`);
  const ids: string[] = [];
  for (const r of ((rows as any)[0] ?? []) as any[]) ids.push(...(await db.getLineUserIdsForUser(Number(r.id)).catch(() => [])));
  return Array.from(new Set(ids));
}

async function projectForAccount(acc: any): Promise<any | null> {
  const projects: any[] = ((await db.getProjectsByUserId(acc.userId)) || []).filter((p: any) => !String(p.id).startsWith("demo_"));
  return projects.find((p) => p.id === acc.defaultProjectId) ?? (projects.length === 1 ? projects[0] : null);
}

/** 1週目を 2026-09-28（月）とした週の番号（切り口の並びを週ごとにずらす） */
function weekIndex(now = Date.now()): number {
  return Math.floor((now - Date.parse("2026-09-28T00:00:00+09:00")) / (7 * 86400_000));
}

/**
 * 週1回の案づくり。
 * @param opts.accountId 1件だけ（確かめ用・条件に届いていなくても作る）
 * @param opts.dryRun    記録もLINEもしない（作った案を返すだけ）
 */
export async function runWeeklySurvey(opts: { accountId?: number; dryRun?: boolean } = {}): Promise<{ targets: number; prepared: number; previews: string[] }> {
  const database = await db.getDb();
  if (!database) return { targets: 0, prepared: 0, previews: [] };
  const { listRepeatDecliners, countRecentDeclines } = await import("./declineFollowup");
  let targets = (await listRepeatDecliners()).filter((t) => isWeeklySurveyTarget(t, FOLLOWUP_MIN_DECLINES));
  if (opts.accountId) {
    const acc: any = await db.getThreadsAccountById(opts.accountId);
    const user: any = acc ? await db.getUserById(acc.userId) : null;
    targets = acc ? [{ accountId: acc.id, userId: acc.userId, username: acc.threadsUsername, userName: user?.name ?? "", declines: await countRecentDeclines(acc.id), published: 0 }] : [];
  }
  const admins = opts.dryRun ? [] : await adminLineIds();
  const previews: string[] = [];
  let prepared = 0;

  for (const t of targets) {
    try {
      // 今週すでに作っていれば作らない
      if (!opts.accountId) {
        const recent: any = await database.execute(sql`
          SELECT COUNT(*) AS n FROM draftSurveyItems WHERE threadsAccountId = ${t.accountId}
            AND createdAt >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(WEEKLY_SURVEY.cooldownDays))} DAY)`);
        if (Number((recent as any)[0]?.[0]?.n ?? 0) > 0) { console.log(`[WeeklySurvey] account=${t.accountId} 今週は作成ずみ`); continue; }
      }
      // お客様のLINEが無ければ、お送りできないので作らない
      const lineIds = await db.getLineUserIdsForUser(t.userId).catch(() => [] as string[]);
      if (lineIds.length === 0 && !opts.dryRun) { console.log(`[WeeklySurvey] account=${t.accountId} LINE未連携のため見送り`); continue; }

      const acc: any = await db.getThreadsAccountById(t.accountId);
      const project = acc ? await projectForAccount(acc) : null;
      if (!project) { console.log(`[WeeklySurvey] account=${t.accountId} お店の情報が決まらないため見送り`); continue; }

      // これまでの案で✕が付いた切り口は後ろへ
      const badRows: any = await database.execute(sql`
        SELECT DISTINCT angle FROM draftSurveyItems WHERE threadsAccountId = ${t.accountId} AND rating = 'bad' AND angle IS NOT NULL`);
      const bad = (((badRows as any)[0] ?? []) as any[]).map((r) => String(r.angle));
      const order = surveyAngleOrder(bad, weekIndex());

      const { generateSurveyDrafts } = await import("./autoPostScheduler");
      const made = await generateSurveyDrafts(t.userId, project, t.accountId, order, WEEKLY_SURVEY.size);
      if (made.length < 4) {
        console.warn(`[WeeklySurvey] account=${t.accountId} 案が${made.length}つしか作れず見送り`);
        continue;
      }
      const { getAngle } = await import("@shared/postAngles");
      const drafts = made.map((m) => ({ angle: m.angleId, label: getAngle(m.angleId)?.label ?? m.angleId, content: m.content }));
      const preview = adminPreviewText({ userName: t.userName, username: t.username, declines: t.declines, published: t.published, drafts });
      previews.push(preview);
      if (opts.dryRun) { prepared++; continue; }

      // 先週の判断待ちは、今週の案に置き換える
      await database.execute(sql`UPDATE draftSurveyItems SET status = 'expired' WHERE threadsAccountId = ${t.accountId} AND status = 'pending'`);
      const { createSurvey } = await import("./draftSurvey");
      const { surveyKey } = await createSurvey(t.accountId, drafts, { pending: true });
      prepared++;

      const { pushMessages } = await import("./lineNotify");
      const { textWithQuick } = await import("./lineChat");
      const buttons = [
        { label: `この${drafts.length}案を送る`, data: `adm=sv&k=${surveyKey}&v=send` },
        { label: "今回は送らない", data: `adm=sv&k=${surveyKey}&v=skip` },
      ];
      for (const id of admins) await pushMessages(id, [textWithQuick(preview, buttons)]);
      console.log(`[WeeklySurvey] account=${t.accountId} ${drafts.length}案を用意（${surveyKey}）→ 三上様へ下見`);
    } catch (e) {
      console.error(`[WeeklySurvey] account=${t.accountId} の案づくりに失敗:`, (e as Error)?.message);
    }
  }
  void SURVEY_ANGLE_POOL;
  return { targets: targets.length, prepared, previews };
}

/**
 * 三上様が押した「この8案を送る／今回は送らない」。二度押しでも1回しか送らない。
 * 返り値は三上様のLINEへお返しする文。
 */
export async function decideWeeklySurvey(surveyKey: string, action: "send" | "skip", adminUserId: number): Promise<string> {
  const database = await db.getDb();
  if (!database) return "いまは処理できませんでした。";
  const key = String(surveyKey).slice(0, 40);
  if (action === "skip") {
    const r: any = await database.execute(sql`UPDATE draftSurveyItems SET status = 'skipped' WHERE surveyKey = ${key} AND status = 'pending'`);
    return Number((r as any)[0]?.affectedRows ?? 0) > 0 ? "今回はお送りしません。お客様には何も届いていません。" : "この案はすでに処理ずみです。";
  }
  // ★案を作ったあとに解約された方には送らない（2026-10-03）
  {
    const owner: any = await database.execute(sql`SELECT userId FROM draftSurveyItems WHERE surveyKey = ${key} LIMIT 1`);
    const ownerId = Number((owner as any)[0]?.[0]?.userId ?? 0);
    if (ownerId && await db.isEndedCustomer(ownerId)) {
      await database.execute(sql`UPDATE draftSurveyItems SET status = 'skipped' WHERE surveyKey = ${key} AND status = 'pending'`);
      return "このお客様はご契約が終了しているため、お送りしませんでした。";
    }
  }
  // ★先に pending → sent に変える（同時に2回押されても、2回目はここで0件になり送らない）
  const upd: any = await database.execute(sql`UPDATE draftSurveyItems SET status = 'sent', sentAt = NOW() WHERE surveyKey = ${key} AND status = 'pending'`);
  if (Number((upd as any)[0]?.affectedRows ?? 0) === 0) return "この案はすでに処理ずみです（送信ずみ・送らない・次の週の案に置き換わった のいずれか）。";

  const rows: any = await database.execute(sql`SELECT * FROM draftSurveyItems WHERE surveyKey = ${key} ORDER BY id`);
  const items: any[] = (rows as any)[0] ?? [];
  const userId = Number(items[0]?.userId ?? 0);
  const pj: any = items[0] ? await db.getProjectById(String(items[0].projectId)).catch(() => null) : null;
  const lineIds = userId ? await db.getLineUserIdsForUser(userId).catch(() => [] as string[]) : [];
  const { buildSurveyMessages } = await import("./draftSurvey");
  const { pushMessages } = await import("./lineNotify");
  const msgs = buildSurveyMessages(
    items.map((it) => ({ id: Number(it.id), angle: String(it.angle ?? ""), label: String(it.label ?? ""), content: String(it.content) })),
    surveyIntro(pj?.storeName ?? null, items.length),
  );
  let ok = 0;
  for (const id of lineIds) if (await pushMessages(id, msgs)) ok++;
  if (ok === 0) {
    await database.execute(sql`UPDATE draftSurveyItems SET status = 'pending', sentAt = NULL WHERE surveyKey = ${key}`);
    return "お客様のLINEへ送れませんでした（LINEの連携が外れている可能性があります）。もう一度押すと送り直します。";
  }
  console.log(`[WeeklySurvey] ${key} を送信（${ok}件・三上様 user=${adminUserId}）`);
  return `お客様のLINEへ${items.length}案をお送りしました。◯が付いた案は、翌朝からの投稿のお手本になります。`;
}

/** 週の定例（月曜11:30 JST） */
export async function runWeeklySurveyJob(): Promise<void> {
  const r = await runWeeklySurvey();
  console.log(`[WeeklySurvey] 対象${r.targets}件・案を用意${r.prepared}件`);
}

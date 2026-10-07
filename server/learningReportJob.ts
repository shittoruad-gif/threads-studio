/**
 * リーチの傾向のまとめ（2026-10-07 三上様「リーチが取れる投稿の傾向を早く取れるように」）。
 * 毎週 月曜・木曜 9:20 に運営へ通知する（お客様には送らない）。手で見るとき：scripts/ops/learning-report.mts
 * 計算は shared/learningReport.ts。
 */
import { sql } from "drizzle-orm";
import * as db from "./db";
import { LEARNING_ACCOUNTS } from "../shared/learningAccounts";
import { learningReportText, type LearningRow } from "../shared/learningReport";

export const LEARNING_REPORT_DAYS = 21;

export async function loadLearningRows(days: number = LEARNING_REPORT_DAYS): Promise<{ learning: LearningRow[]; all: LearningRow[] }> {
  const d = await db.getDb();
  if (!d) return { learning: [], all: [] };
  const query = (withKey: boolean) => d.execute(sql`
    SELECT pa.threadsAccountId AS accountId, pa.impressions, TIMESTAMPDIFF(SECOND, '1970-01-01 00:00:00', pa.postedAt) AS postedTs, pa.postContent AS text,
      ${withKey ? sql`sp.experimentKey` : sql`NULL`} AS experimentKey, sp.angle, pr.area
    FROM postAnalytics pa
    LEFT JOIN scheduledPosts sp ON sp.publishedThreadsPostId = pa.threadsPostId AND sp.userId = pa.userId
    LEFT JOIN threadsAccounts a ON a.id = pa.threadsAccountId
    LEFT JOIN projects pr ON pr.id = a.defaultProjectId
    WHERE pa.threadsAccountId IS NOT NULL AND pa.postedAt IS NOT NULL
      AND pa.postedAt >= UTC_TIMESTAMP() - INTERVAL ${days} DAY`);
  // 0108 が入る前（手元で本番を読むとき）は条件の列が無いので、無しで読む
  let res: any;
  try { res = await query(true); } catch { res = await query(false); }
  const rows: LearningRow[] = (((res as any)[0] ?? []) as any[])
    // Meta AI呼びかけは仕組みが違う（ご本人がアプリから出す）ので混ぜない
    .filter((r) => !/^\s*@meta\.ai/.test(String(r.text ?? "")))
    .map((r) => ({
      accountId: Number(r.accountId), impressions: Number(r.impressions) || 0,
      // ★DBの時刻はUTC。日時のまま読むと、手元（日本時間のMac）では9時間ずれる。秒に直してから読む
      postedAt: new Date(Number(r.postedTs) * 1000),
      text: String(r.text ?? ""), experimentKey: r.experimentKey ? String(r.experimentKey) : null,
      angle: r.angle ? String(r.angle) : null, area: r.area ? String(r.area) : null,
    }));
  return { learning: rows.filter((r) => LEARNING_ACCOUNTS.accountIds.includes(r.accountId)), all: rows };
}

export async function runLearningReportJob(): Promise<void> {
  const { learning, all } = await loadLearningRows();
  const text = learningReportText({ learning, all, days: LEARNING_REPORT_DAYS });
  console.log(`[LearningReport] Moveact ${learning.length}本・全体 ${all.length}本`);
  try {
    const { notifyOwner } = await import("./_core/notification");
    await notifyOwner({ title: "リーチの傾向（学習の試しのまとめ）", content: text });
  } catch (e) {
    console.warn(`[LearningReport] 運営への通知に失敗: ${(e as Error)?.message}`);
  }
}

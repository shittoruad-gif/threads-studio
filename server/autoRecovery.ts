/**
 * 閲覧の落ち込みを毎回の生成の前に数え直す（2026-11-26 三上様「解約が続出します。責任もってリーチを伸ばして」）。
 * 落ち込んだアカウントは shared/accountRecovery.ts の回復期間と同じ手当て（試しの投稿を外す・宣伝の文と使い古した書き出しを
 * 作り直す・書き方の指示）を自動で受ける。本数は変えない。新しく入ったアカウントは三上様へ1回だけ知らせる。
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { AUTO_RECOVERY_RULE, isSlumping, median, peakWeekMedian, setAutoRecovery, type RecoveryPlan } from "../shared/accountRecovery";

const notified = new Set<string>();
const JST = 9 * 3600_000;
const ymd = (t: number) => new Date(t + JST).toISOString().slice(0, 10);

export async function refreshAutoRecovery(now: number = Date.now()): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const R = AUTO_RECOVERY_RULE;
  // 公開から1日たっていない投稿は数字が育っていないので数えない。w=0 が直近7日、1〜8 がその前の週
  const rows: any[] = ((await db.execute(sql`
    SELECT threadsAccountId acc, impressions imp,
      FLOOR(TIMESTAMPDIFF(HOUR, postedAt, NOW() - INTERVAL 1 DAY) / ${R.recentDays * 24}) w
    FROM postAnalytics
    WHERE threadsAccountId IS NOT NULL
      AND postedAt >= NOW() - INTERVAL ${(R.baseWeeks + 1) * 7 + 1} DAY
      AND postedAt < NOW() - INTERVAL 1 DAY`)) as any)[0] ?? [];
  const by = new Map<number, number[][]>();
  for (const x of rows) {
    const a = Number(x.acc), w = Number(x.w);
    if (!(w >= 0 && w <= R.baseWeeks)) continue;
    const weeks = by.get(a) ?? Array.from({ length: R.baseWeeks + 1 }, () => [] as number[]);
    weeks[w]!.push(Number(x.imp) || 0);
    by.set(a, weeks);
  }
  const plans = new Map<number, RecoveryPlan>();
  const lines: string[] = [];
  const from = ymd(now), until = ymd(now + R.holdDays * 86400_000);
  for (const [a, weeks] of Array.from(by.entries())) {
    const recent = weeks[0]!, base = weeks.slice(1);
    if (!isSlumping(recent, base)) continue;
    plans.set(a, { from, until, perDay: null, auto: true });
    const key = `${a}:${from.slice(0, 7)}`;
    if (!notified.has(key)) {
      notified.add(key);
      lines.push(`account ${a}：1本あたり 良かった週 ${peakWeekMedian(base)} → 直近7日 ${median(recent)}（${recent.length}本）`);
    }
  }
  setAutoRecovery(plans);
  console.log(`[AutoRecovery] 落ち込み ${plans.size}件: ${Array.from(plans.keys()).join(",") || "なし"}`);
  if (lines.length > 0) {
    try {
      const { notifyOwner } = await import("./_core/notification");
      await notifyOwner({
        title: `閲覧が落ち込んだアカウント ${lines.length}件（自動で回復の手当てに入れました）`,
        content: lines.join("\n")
          + "\n\n本数・予約の案内は変えていません。試しの投稿（アンケート・クイズ・1か所だけ変えた投稿・ツリー等）を外し、短く書き、使い古した書き出しを作り直します。"
          + "\nいいね・返信などの交流は自動ではできないので、お客様ご本人に「1日10人ほどと交流」をお願いするかを決めてください（お客様への送信はしていません）。",
      });
    } catch (e) {
      console.warn(`[AutoRecovery] 通知に失敗: ${(e as Error)?.message}`);
    }
  }
  return Array.from(plans.keys());
}

/**
 * 本日の公開数の通知（毎日 23:35 JST）。2026-09-05 三上様指示。
 *
 * 「1件も公開されなかった時点で『公開されていません』とクライアントに分かるように、
 *  数値をきちんと送る」。契約どおりの本数が出たかを、アカウントごとに数字で伝える。
 *
 * - 対象：Threads連携があり、公式LINEがつながっている方
 * - 自動投稿OFFのアカウントは対象外（意図してOFFにしている）
 * - 0件のときは理由（承認待ち／取り消し／失敗）も添え、次に何をすればよいかを書く
 */
import * as db from "./db";
import { effectiveAccountSettings, FREQ_LABEL } from "../shared/accountSettings";
import { getPlan, resolveEffectivePlanId } from "../shared/plans";

const FREQ_COUNT: Record<string, number> = { daily: 1, twice_daily: 2, three_daily: 3 };

export function buildDailyPostCountMessage(
  dateLabel: string,
  rows: Array<{ username: string; posted: number; awaiting: number; canceled: number; failed: number; pending: number; entitled: number }>,
): string {
  const lines: string[] = [`本日の投稿結果（${dateLabel}）`];
  let anyZero = false;
  for (const r of rows) {
    const head = `・@${r.username}：公開 ${r.posted}件（ご契約 1日${r.entitled}件）`;
    if (r.posted === 0) {
      anyZero = true;
      const why: string[] = [];
      if (r.awaiting > 0) why.push(`承認待ち ${r.awaiting}件`);
      if (r.canceled > 0) why.push(`取り消し ${r.canceled}件`);
      if (r.failed > 0) why.push(`失敗 ${r.failed}件`);
      if (r.pending > 0) why.push(`未公開 ${r.pending}件`);
      lines.push(`${head}\n　★本日は1件も公開されていません${why.length ? `（${why.join("・")}）` : ""}`);
    } else if (r.posted < r.entitled) {
      const why: string[] = [];
      if (r.awaiting > 0) why.push(`承認待ち ${r.awaiting}件`);
      if (r.canceled > 0) why.push(`取り消し ${r.canceled}件`);
      if (r.failed > 0) why.push(`失敗 ${r.failed}件`);
      lines.push(`${head}\n　※ ご契約より ${r.entitled - r.posted}件 少ない${why.length ? `（${why.join("・")}）` : ""}`);
    } else {
      lines.push(head);
    }
  }
  lines.push("");
  if (anyZero) {
    lines.push("承認待ちの投稿は「今日の投稿」から、そのまま公開できます。");
    lines.push("取り消した投稿は復活しません。明日の投稿は、いつもどおり朝に作られます。");
  } else {
    lines.push("明日も同じ時間帯に投稿します。");
  }
  return lines.join("\n");
}

export async function runDailyPostCountReportJob(): Promise<void> {
  const stats = await db.getTodayAutoPostStatsByAccount();
  if (stats.length === 0) { console.log("[DailyPostCount] 対象なし"); return; }

  const byUser = new Map<number, typeof stats>();
  for (const r of stats) { const a = byUser.get(r.userId) ?? []; a.push(r); byUser.set(r.userId, a); }

  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const dateLabel = `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;
  let sent = 0;

  for (const [userId, rows] of Array.from(byUser.entries())) {
    try {
      const targets = await db.getLineUserIdsForUser(userId);
      if (targets.length === 0) continue; // LINE未連携の方には送らない（アプリの履歴で見られる）
      const user: any = await db.getUserById(userId);
      if (!user || user.isDemoMode) continue;
      const sub = await db.getSubscriptionByUserId(userId);
      const plan = getPlan(resolveEffectivePlanId(sub?.planId, sub?.status));
      const maxPerDay = Number(plan?.features?.maxAutoPostsPerDay ?? 0);
      if (maxPerDay <= 0) continue; // 自動投稿の無いプラン
      const common = await db.getAutoPostSettings(userId);
      const accounts = await db.getThreadsAccountsByUserId(userId);
      const lines: Array<{ username: string; posted: number; awaiting: number; canceled: number; failed: number; pending: number; entitled: number }> = [];
      for (const r of rows) {
        const acct: any = (accounts || []).find((a: any) => Number(a.id) === r.accountId);
        const eff = effectiveAccountSettings(common as any, acct);
        if (!eff.autoPostEnabled) continue; // 自動投稿OFFのアカウントは数えない
        const entitled = Math.min(FREQ_COUNT[eff.autoPostFrequency] ?? 1, maxPerDay);
        lines.push({ ...r, entitled });
      }
      if (lines.length === 0) continue;
      const text = buildDailyPostCountMessage(dateLabel, lines);
      const { pushMessages } = await import("./lineNotify");
      for (const to of targets) await pushMessages(to, [{ type: "text", text }]);
      sent++;
      const zero = lines.filter((l) => l.posted === 0).length;
      console.log(`[DailyPostCount] 送信 user=${userId} accounts=${lines.length} zero=${zero}`);
    } catch (e) {
      console.error(`[DailyPostCount] 失敗 user=${userId}:`, e);
    }
  }
  console.log(`[DailyPostCount] 完了 送信=${sent}件`);
  void FREQ_LABEL;
}

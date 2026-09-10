/**
 * 昨日の公開数の通知（毎朝 7:40 JST）。2026-09-05 三上様指示・翌日朝に変更（夜中の通知は迷惑）。
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
  rows: Array<{ username: string; posted: number; awaiting: number; canceled: number; failed: number; pending: number; entitled: number; note?: string; carryNote?: string }>,
): string {
  const lines: string[] = [`昨日の投稿結果（${dateLabel}）`];
  let anyZero = false;
  for (const r of rows) {
    const head = `・@${r.username}：公開 ${r.posted}件（${r.note ? r.note : `ご契約 1日${r.entitled}件`}）`;
    if (r.posted === 0) {
      anyZero = true;
      const why: string[] = [];
      if (r.awaiting > 0) why.push(`承認待ち ${r.awaiting}件`);
      if (r.canceled > 0) why.push(`取り消し ${r.canceled}件`);
      if (r.failed > 0) why.push(`失敗 ${r.failed}件`);
      if (r.pending > 0) why.push(`未公開 ${r.pending}件`);
      lines.push(`${head}\n　★昨日は1件も公開されていません${why.length ? `（${why.join("・")}）` : ""}`);
    } else if (r.posted < r.entitled) {
      const why: string[] = [];
      if (r.awaiting > 0) why.push(`承認待ち ${r.awaiting}件`);
      if (r.canceled > 0) why.push(`取り消し ${r.canceled}件`);
      if (r.failed > 0) why.push(`失敗 ${r.failed}件`);
      lines.push(`${head}\n　※ ご契約より ${r.entitled - r.posted}件 少ない${why.length ? `（${why.join("・")}）` : ""}`);
    } else {
      lines.push(head);
    }
    if (r.carryNote) lines.push(`　→ ${r.carryNote}`);
  }
  lines.push("");
  if (anyZero) {
    lines.push("承認待ちの投稿は「今日の投稿」から、そのまま公開できます。");
    lines.push("取り消した投稿は復活しません。今日の投稿は、いつもどおり朝に作られています。");
  } else {
    lines.push("今日も同じ時間帯に投稿します。");
  }
  return lines.join("\n");
}

/**
 * 1人分の「昨日の投稿結果」の文（朝のまとめ通知 morningDigestJob からも使う）。
 * 自動投稿の無いプラン・デモ・全アカウントOFFなら null。
 */
export async function buildDailyCountTextForUser(
  userId: number,
  rows: Array<{ accountId: number; username: string; posted: number; awaiting: number; canceled: number; failed: number; pending: number }>,
  dateLabel: string,
): Promise<{ text: string; accounts: number; zero: number } | null> {
  const user: any = await db.getUserById(userId);
  if (!user || user.isDemoMode) return null;
  const sub = await db.getSubscriptionByUserId(userId);
  const plan = getPlan(resolveEffectivePlanId(sub?.planId, sub?.status));
  const maxPerDay = Number(plan?.features?.maxAutoPostsPerDay ?? 0);
  if (maxPerDay <= 0) return null; // 自動投稿の無いプラン
  const common = await db.getAutoPostSettings(userId);
  const accounts = await db.getThreadsAccountsByUserId(userId);
  const lines: Array<{ username: string; posted: number; awaiting: number; canceled: number; failed: number; pending: number; entitled: number; note?: string; carryNote?: string }> = [];
  for (const r of rows) {
    const acct: any = (accounts || []).find((a: any) => Number(a.id) === r.accountId);
    const eff = effectiveAccountSettings(common as any, acct);
    if (!eff.autoPostEnabled) continue; // 自動投稿OFFのアカウントは数えない
    let entitled = Math.min(FREQ_COUNT[eff.autoPostFrequency] ?? 1, maxPerDay);
    let note: string | undefined;
    // 新しいアカウントは慣らし運転中の本数で数える（「ご契約より少ない」と出さない）。補填中は＋の本数と理由
    try {
      const { rampForAccount } = await import("./accountRampCheck");
      const full: any = acct ? await db.getThreadsAccountById(Number(acct.id)) : null;
      const rc = full ? await rampForAccount(full, entitled) : { count: entitled, capped: false, extra: false, note: "" };
      if (rc.capped) { entitled = rc.count; note = rc.note; }
      else if (rc.extra) { entitled = rc.count; note = rc.note; }
    } catch { /* そのまま */ }
    // 昨日届かなかった分を今日に足していれば、そのことを伝える（自動補填・2026-09-10）
    let carryNote: string | undefined;
    try {
      const { jstDateString, dateColToJst } = await import("../shared/accountRamp");
      const full: any = acct ? await db.getThreadsAccountById(Number(acct.id)) : null;
      if (full && dateColToJst(full.carryDate) === jstDateString(0) && Number(full.carryCount) > 0) {
        carryNote = `昨日届かなかった分のうち${full.carryCount}件を、今日の投稿に足しています`;
      }
    } catch { /* 無ければ出さない */ }
    lines.push({ ...r, entitled, note, carryNote });
  }
  if (lines.length === 0) return null;
  return { text: buildDailyPostCountMessage(dateLabel, lines), accounts: lines.length, zero: lines.filter((l) => l.posted === 0).length };
}

/** 昨日（JST）の日付ラベル（例：9月9日） */
export function yesterdayLabelJst(): string {
  const jst = new Date(Date.now() + 9 * 3600 * 1000 - 24 * 3600 * 1000);
  return `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;
}

export async function runDailyPostCountReportJob(): Promise<void> {
  const stats = await db.getYesterdayAutoPostStatsByAccount();
  if (stats.length === 0) { console.log("[DailyPostCount] 対象なし"); return; }

  const byUser = new Map<number, typeof stats>();
  for (const r of stats) { const a = byUser.get(r.userId) ?? []; a.push(r); byUser.set(r.userId, a); }

  const jst = new Date(Date.now() + 9 * 3600 * 1000 - 24 * 3600 * 1000); // 昨日（JST）
  const dateLabel = `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;
  let sent = 0;

  for (const [userId, rows] of Array.from(byUser.entries())) {
    try {
      const targets = await db.getLineUserIdsForUser(userId);
      if (targets.length === 0) continue; // LINE未連携の方には送らない（アプリの履歴で見られる）
      const built = await buildDailyCountTextForUser(userId, rows, dateLabel);
      if (!built) continue;
      const { pushMessages } = await import("./lineNotify");
      for (const to of targets) await pushMessages(to, [{ type: "text", text: built.text }]);
      sent++;
      console.log(`[DailyPostCount] 送信 user=${userId} accounts=${built.accounts} zero=${built.zero}`);
    } catch (e) {
      console.error(`[DailyPostCount] 失敗 user=${userId}:`, e);
    }
  }
  console.log(`[DailyPostCount] 完了 送信=${sent}件`);
  void FREQ_LABEL;
}

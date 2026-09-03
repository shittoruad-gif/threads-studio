/**
 * しっとる社内への朝の報告（公式LINE「【しっとる報告用】」へ）。
 *
 * お客様が登録や投稿でつまずいたまま止まっていても、こちらが気づかなければ
 * 何日も放置される。管理画面を毎日見るのは現実的でないので、
 * 「人が動くべきことがある日だけ」LINEに届くようにする。
 *
 * 方針:
 *  - お客様には何も送らない。宛先は社内のLINEだけ。
 *  - 何もなければ「対応不要」の1行。毎日ずらずら送らない。
 *  - 重い順に並べる（お金を払っているのに動いていない方が最優先）。
 */
import * as db from "./db";
import { detectNextAction } from "./nextAction";

/**
 * 報告から外すアカウント。
 * ★検証用・審査用が混ざると、本当に見るべき方が埋もれて読まれなくなる。
 *   （ローカルの検証環境には数十件あり、報告が全部それで埋まった）
 */
function isInternalAccount(u: { email?: string | null; name?: string | null }): boolean {
  const email = String(u.email || "").toLowerCase();
  const name = String(u.name || "");
  if (email.endsWith("@example.com")) return true;
  if (email.includes("meta-review")) return true;
  if (/^(qa-|test-|nightqa)/.test(email)) return true;
  if (/(Test User|テストユーザー|ナイト検証|サンプル)/i.test(name)) return true;
  return false;
}

/** 工程の種類を、社内向けの短い日本語にする */
const STEP_LABEL: Record<string, string> = {
  no_project: "お店の情報が未登録",
  no_account: "Threads未連携",
  account_without_project: "アカウントに店舗情報が未紐づけ",
  account_unpinned: "どの店舗情報を使うか未設定",
  no_pinned: "固定投稿が未作成",
  not_posted: "固定投稿がThreads未公開",
  pin_not_confirmed: "固定投稿のピン留めが未確認",
  auto_off: "自動投稿がOFF",
  approval_off: "公開前の確認がOFF",
};

export async function runOpsDigestJob(): Promise<void> {
  const { getPlan, resolveEffectivePlanId } = await import("@shared/plans");

  const users = await db.getAllUsers().catch(() => [] as any[]);
  // お金をいただいているのに何も動いていない方（最優先）
  const paidStuck: string[] = [];
  // 無料で使っていて止まっている方
  const freeStuck: string[] = [];
  // 投稿が失敗している方
  const failing: string[] = [];

  for (const u of users as any[]) {
    try {
      if (isInternalAccount(u)) continue;
      const sub = await db.getSubscriptionByUserId(u.id).catch(() => null);
      const planId = resolveEffectivePlanId(sub?.planId, sub?.status);
      const plan = getPlan(planId);
      const paid = Boolean(plan && plan.priceMonthly > 0);
      const name = String(u.name || u.email || `#${u.id}`);

      // 直近1週間で失敗した投稿
      try {
        const failed = await db.countFailedPostsSince(u.id, 7);
        if (failed > 0) failing.push(`${name}：投稿の失敗 ${failed}件`);
      } catch { /* 取れなければ触れない */ }

      const action = await detectNextAction(u.id);
      if (!action) continue;

      // 「公開前の確認がOFF」はご本人の好みなので、社内報告には出さない
      if (action.key === "approval_off") continue;

      const label = STEP_LABEL[action.key] ?? action.key;
      if (paid) {
        const posted = await db.countPostedPosts(u.id).catch(() => 1);
        const mark = posted === 0 ? "（まだ1件も投稿されていません）" : "";
        paidStuck.push(`${name}（${plan?.name}）：${label}${mark}`);
      } else {
        freeStuck.push(`${name}：${label}`);
      }
    } catch (e) {
      console.error(`[OpsDigest] user=${u.id} の集計に失敗:`, e);
    }
  }

  // 担当者の返信待ち
  let waiting: any[] = [];
  try {
    const rows = await db.listSupportQuestions({ needsHumanOnly: true, limit: 50 });
    waiting = (rows || []).filter((r: any) => !r.repliedAt);
  } catch { /* 取れなければ0件扱いにせず、下で触れない */ }

  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(5, 10).replace("-", "/");

  const lines: string[] = [];
  if (paidStuck.length) {
    lines.push("【ご契約中で止まっている方】");
    lines.push(...paidStuck.map((s) => `・${s}`));
  }
  if (failing.length) {
    lines.push("");
    lines.push("【投稿が失敗している方】");
    lines.push(...failing.map((s) => `・${s}`));
  }
  if (waiting.length) {
    lines.push("");
    lines.push(`【担当者の返信待ち】${waiting.length}件`);
    lines.push(...waiting.slice(0, 3).map((q: any) => `・${String(q.question).replace(/\s+/g, " ").slice(0, 40)}`));
  }
  if (freeStuck.length) {
    lines.push("");
    lines.push(`【無料でお使いの方で止まっている方】${freeStuck.length}名`);
    lines.push(...freeStuck.slice(0, 5).map((s) => `・${s}`));
  }

  const { notifyLine } = await import("./_core/notification");

  if (lines.length === 0) {
    await notifyLine(
      `Threads Studio ${today} の状況`,
      "本日、人が動くべきことはありません。ご契約中の皆さまは投稿が動いています。",
    );
    console.log("[OpsDigest] 対応不要として報告しました");
    return;
  }

  await notifyLine(
    `Threads Studio ${today} の状況`,
    lines.join("\n") + `\n\n管理画面\n${base}/admin/questions`,
  );
  console.log(
    `[OpsDigest] 報告しました（契約中${paidStuck.length}件 / 失敗${failing.length}件 / 返信待ち${waiting.length}件 / 無料${freeStuck.length}件）`,
  );
}

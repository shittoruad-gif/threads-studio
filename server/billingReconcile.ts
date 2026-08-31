import { getDb } from "./db";
import { subscriptions } from "../drizzle/schema";
import { getSubscription } from "./univapay";
import { notifyOwner } from "./_core/notification";
import { eq, sql } from "drizzle-orm";

/**
 * 課金状態の日次照合（Univapay ↔ アプリDB）
 *
 * なぜ必要か:
 *   契約状態の更新は Univapay の Webhook 受信時にしか行われない。そのため
 *     ① 解約・失敗のWebhookが届かない（設定漏れ・送信失敗・イベント未対応）
 *     ② Univapay 側だけで解約された
 *   のどちらでも、アプリのDBは古い状態のまま固まり、誰も気づけない。
 *
 *   実際に Keiro（同じ Univapay ストアを使う別プロダクト）で、Univapay 側は
 *   解約済みなのにアプリ側は trialing のまま12日間使われ続けた事例が発生した
 *   （2026-08-31 検出）。本ジョブはその横展開。
 *
 * 何をするか:
 *   univapaySubscriptionId を持つ契約について Univapay の実状態を取得し、
 *   食い違っていればDBを実態に合わせ、運営へ1通にまとめて通知する。
 *
 * 方針:
 *   - DBを「実態に合わせる」ことだけを行う。プラン停止などの副作用は起こさない
 *     （停止は既存の paymentFollowUp が猶予期間つきで担当している）。
 *   - Univapay に存在しないID（テスト用など）は失敗として記録するだけで落とさない。
 */

/** Univapay の契約ステータス → アプリの subscriptions.status */
const STATUS_MAP: Record<string, string> = {
  current: "active",
  unconfirmed: "trialing",
  canceled: "canceled",
  completed: "canceled",
  unpaid: "unpaid",
  suspended: "past_due",
};

export function mapUnivapayStatus(univapayStatus: string | undefined | null): string | null {
  if (!univapayStatus) return null;
  return STATUS_MAP[String(univapayStatus).toLowerCase()] ?? null;
}

type Changed = {
  subscriptionId: number;
  userId: number;
  from: string;
  to: string;
  amount?: number;
};

type Failed = { subscriptionId: number; reason: string };

export type ReconcileResult = {
  checked: number;
  updated: Changed[];
  failed: Failed[];
};

export async function runBillingReconcileJob(): Promise<ReconcileResult> {
  const result: ReconcileResult = { checked: 0, updated: [], failed: [] };

  const db = await getDb();
  if (!db) {
    console.log("[BillingReconcile] DB未接続のためスキップ");
    return result;
  }

  const rows = await db
    .select()
    .from(subscriptions)
    .where(sql`${subscriptions.univapaySubscriptionId} IS NOT NULL AND ${subscriptions.univapaySubscriptionId} <> ''`);

  for (const row of rows) {
    result.checked += 1;
    let remote: any;
    try {
      remote = await getSubscription(row.univapaySubscriptionId as string);
    } catch (e: any) {
      // Univapay に無いID（テスト用など）や通信断。落とさず記録だけ残す。
      result.failed.push({ subscriptionId: row.id, reason: String(e?.message ?? e).slice(0, 200) });
      continue;
    }

    const mapped = mapUnivapayStatus(remote?.status);
    if (!mapped) {
      console.warn(`[BillingReconcile] 未知のUnivapayステータス: ${remote?.status} (sub=${row.id})`);
      continue;
    }
    if (mapped === row.status) continue;

    const patch: Record<string, unknown> = { status: mapped };
    const due = remote?.next_payment?.due_date;
    if (due) {
      const d = new Date(due);
      if (!Number.isNaN(d.getTime())) patch.currentPeriodEnd = d;
    }

    await db.update(subscriptions).set(patch).where(eq(subscriptions.id, row.id));

    result.updated.push({
      subscriptionId: row.id,
      userId: row.userId,
      from: row.status as string,
      to: mapped,
      amount: remote?.amount,
    });
    console.log(`[BillingReconcile] sub=${row.id} ${row.status} → ${mapped}`);
  }

  if (result.updated.length || result.failed.length) {
    const lines: string[] = [];
    if (result.updated.length) {
      lines.push("Univapayと食い違っていた契約を、実態に合わせて修正しました。");
      for (const u of result.updated) {
        lines.push(
          `・契約ID ${u.subscriptionId}（ユーザーID ${u.userId}）: ${u.from} → ${u.to}` +
            (u.amount ? ` / 月額 ${Number(u.amount).toLocaleString()}円` : "")
        );
      }
    }
    if (result.failed.length) {
      lines.push("");
      lines.push("照合できなかった契約（Univapayに見つからない等）:");
      for (const f of result.failed) lines.push(`・契約ID ${f.subscriptionId}: ${f.reason}`);
    }
    await notifyOwner({
      title: `[Threads Studio] 課金の照合結果: 要確認 ${result.updated.length + result.failed.length}件`,
      content: lines.join("\n"),
    }).catch((e) => console.error("[BillingReconcile] 通知失敗", e));
  }

  console.log(
    `[BillingReconcile] 完了 checked=${result.checked} updated=${result.updated.length} failed=${result.failed.length}`
  );
  return result;
}

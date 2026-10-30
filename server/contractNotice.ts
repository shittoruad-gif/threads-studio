/**
 * 契約・解約の知らせを運営（三上様）へ送る（2026-10-30 三上様「契約や解約の通知は、スタジオからこちらに送られるようにして」）。
 * 送り先は notifyOwner と同じ（運営のLINE＝LINE_ADMIN_TARGET_ID と、ADMIN_NOTIFICATION_EMAIL）。お客様へは送らない。
 * 失敗しても契約の処理は止めない。
 */
import { getPlan } from "../shared/plans";

export type ContractEvent =
  | "new_trial"        // お申し込み（お試しが始まった）
  | "new_paid"         // お申し込み（初回のお支払い）
  | "trial_to_paid"    // お試しから有料へ
  | "restarted"        // 解約済みの方の契約が戻った
  | "recovered"        // 支払いの止まりが解けた
  | "plan_changed"     // 予定していたプラン変更が切り替わった
  | "cancel_requested" // ご本人が解約の手続きをした（期間の終わりまで利用）
  | "cancel_stopped"   // 解約の予約どおり定期課金を止めた（運営の手続きなど）
  | "canceled"         // 決済側で解約になった（すぐ止まる）
  | "ended"            // 利用期間が終わって止まった
  | "payment_stopped"  // 支払いが止まったまま猶予が過ぎ、自動で止めた
  | "ignored";         // 決済の知らせを見送った（契約は変えていない）

const TITLE: Record<ContractEvent, string> = {
  new_trial: "新しいお申し込み（お試し開始）",
  new_paid: "新しいお申し込み（初回のお支払い）",
  trial_to_paid: "お試しから有料へ",
  restarted: "契約の再開",
  recovered: "お支払いの止まりが解けました",
  plan_changed: "プラン変更",
  cancel_requested: "解約のお手続き",
  cancel_stopped: "解約の予約どおり決済を止めました",
  canceled: "解約（決済側で停止）",
  ended: "契約終了（利用期間の終わり）",
  payment_stopped: "お支払いが止まったため停止",
  ignored: "決済の知らせを見送りました（契約は変えていません）",
};

const jst = (d: Date | string | null | undefined) => {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ").replace(/^\d{4}-/, "").replace("-", "/");
};

export function contractNoticeText(ev: ContractEvent, p: {
  userId: number; name?: string | null; storeName?: string | null; email?: string | null;
  planId?: string | null; fromPlanId?: string | null; amount?: number | null; until?: Date | string | null; detail?: string | null;
}): { title: string; content: string } {
  const plan = p.planId ? getPlan(p.planId)?.name ?? p.planId : null;
  const from = p.fromPlanId ? getPlan(p.fromPlanId)?.name ?? p.fromPlanId : null;
  const who = [p.storeName, p.name].filter(Boolean).join("／") || "(お名前なし)";
  const lines = [
    `${who}（user ${p.userId}）`,
    p.email ? `メール：${p.email}` : "",
    plan ? `プラン：${from && from !== plan ? `${from} → ` : ""}${plan}` : "",
    p.amount != null ? `金額：${Number(p.amount).toLocaleString("ja-JP")}円` : "",
    p.until ? `${ev === "cancel_requested" || ev === "cancel_stopped" ? "使える期間" : "次の区切り"}：${jst(p.until)}まで` : "",
    p.detail ?? "",
  ].filter(Boolean);
  return { title: `【Threads Studio】${TITLE[ev]}`, content: lines.join("\n") };
}

export async function notifyContract(ev: ContractEvent, p: Parameters<typeof contractNoticeText>[1]): Promise<void> {
  try {
    let q = p;
    if (!p.name && !p.storeName) {
      const db = await import("./db");
      const u: any = await db.getUserById(p.userId).catch(() => null);
      if (u) q = { ...p, name: u.name ?? null, storeName: u.storeName ?? null, email: p.email ?? u.email ?? null };
    }
    const { notifyOwner } = await import("./_core/notification");
    await notifyOwner(contractNoticeText(ev, q));
  } catch (e) {
    console.warn(`[ContractNotice] 知らせを送れませんでした ev=${ev} user=${p.userId}:`, (e as Error)?.message);
  }
}

/**
 * UnivaPay の知らせのうち、Threads Studio の契約を変えてはいけないものを見分ける（2026-10-30）。
 *
 * きっかけ：解約済みのお客様が、しっとるの別のサービス（月3,300円の定期課金）のカードを登録し直した。
 *   そのときの「カード確認の1円の承認（type=cvv_auth・subscription_id なし・metadata に univapay-patch-*）」を、
 *   Threads Studio が「お金をいただいた」と受け取り、解約前のプランで契約を戻して自動投稿を再開してしまった。
 *   UnivaPay の店舗は全サービス共用なので、Threads Studio には他のサービスの知らせも全部届く。
 *
 * 決まり（どれか1つに当たれば、契約は変えない）：
 *   1 カード確認（type=cvv_auth）……お金は動いていない
 *   2 カードの登録し直し（metadata に univapay-patch-…）……支払いでも申し込みでもない
 *   3 定期課金の番号が無い課金で、金額が Threads Studio のプランの額でない……他のサービスの単発の決済
 *   4 別の定期課金の課金で、金額が Threads Studio のプランの額でない……他のサービスの継続の決済
 *   5 解約済み・未契約のお客様を「有効」に戻す知らせで、金額がプランの額でない（予定のプラン変更も無い）
 */
export type BillingGuardReason = "card_check" | "card_update" | "other_service_charge" | "other_subscription" | "not_a_plan_amount";

export interface BillingGuardInput {
  /** 知らせの種類（charge_finished / charge_updated / subscription_created など・小文字） */
  eventType: string;
  /** data.type（cvv_auth など） */
  dataType?: string | null;
  metadata?: Record<string, unknown> | null;
  /** 知らせに入っている定期課金の番号（課金の番号ではない） */
  eventSubscriptionId?: string | null;
  /** 金額が Threads Studio のどのプランの額と一致したか */
  matchedPlanId?: string | null;
  /** 次の請求から切り替える予定のプラン（金額が変わる） */
  pendingPlanId?: string | null;
  /** いまのアプリの契約 */
  existingStatus?: string | null;
  existingSubscriptionId?: string | null;
  /** この知らせで契約を有効・お試しにしようとしているか */
  wouldActivate: boolean;
}

export interface BillingGuardResult {
  ignore: boolean;
  reason?: BillingGuardReason;
  /** 運営に知らせる（解約済み・未契約のお客様が戻りかけた・いま使っている方の契約に触れかけた） */
  notify?: boolean;
}

const isCharge = (t: string) => /charge|payment/.test(t);

export function judgeBillingEvent(i: BillingGuardInput): BillingGuardResult {
  const t = String(i.eventType || "").toLowerCase();
  const active = i.existingStatus === "active" || i.existingStatus === "trialing" || i.existingStatus === "past_due";
  const touches = i.wouldActivate && !active;
  if (String(i.dataType ?? "").toLowerCase() === "cvv_auth") return { ignore: true, reason: "card_check", notify: touches };
  const meta = i.metadata && typeof i.metadata === "object" ? Object.keys(i.metadata) : [];
  if (meta.some((k) => /^univapay-patch-/.test(k))) return { ignore: true, reason: "card_update", notify: touches };
  if (isCharge(t) && !i.matchedPlanId) {
    if (!i.eventSubscriptionId) return { ignore: true, reason: "other_service_charge", notify: touches };
    if (i.existingSubscriptionId && i.eventSubscriptionId !== i.existingSubscriptionId) {
      return { ignore: true, reason: "other_subscription", notify: touches };
    }
  }
  if (touches && !i.matchedPlanId && !i.pendingPlanId) return { ignore: true, reason: "not_a_plan_amount", notify: !!i.existingStatus };
  return { ignore: false };
}

export const BILLING_GUARD_LABEL: Record<BillingGuardReason, string> = {
  card_check: "カード確認（1円の承認）",
  card_update: "カードの登録し直し",
  other_service_charge: "他のサービスの決済（定期課金の番号なし・プランの額ではない）",
  other_subscription: "他の定期課金の決済（プランの額ではない）",
  not_a_plan_amount: "プランの額ではない決済",
};

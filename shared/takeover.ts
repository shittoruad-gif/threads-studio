/**
 * 代理店解約時のクライアント引き継ぎ（2026-08-30 三上さん指示）。
 *
 * 従来: 代理店（月額55,000円）が解約されると、発行済みクライアントIDを即時停止。
 * 変更: クライアントを止めずに「引き継ぎ猶予」に入れ、猶予期間内に
 *   運営（しっとる）が同じ金額での直接契約を案内して引き継げるようにする。
 *
 * 流れ:
 *   1. 解約Webhook → 配下クライアントに takeoverPendingAt を記録（利用は継続）
 *      ＋ 運営へ通知メール（クライアント一覧つき）
 *   2. 運営が管理画面（/admin/billing）から、クライアントごとに
 *      「引き継ぎ案内メール」（代理店に払っていたのと同じ月額＋決済リンク）を送る
 *   3. 決済確認後「切替完了」→ 通常プランの直接契約に変わる
 *      （引き継がない場合は「停止」）
 *   4. 猶予期限を過ぎても未対応なら、日次ジョブが自動停止する
 */

/** 引き継ぎ猶予の日数。この間クライアントは無料のまま使い続けられる */
export const TAKEOVER_GRACE_DAYS = 30;

/** 猶予期限が切れているか */
export function takeoverExpired(pendingAt: Date | string, now: Date): boolean {
  return takeoverDaysLeft(pendingAt, now) <= 0;
}

/** 猶予の残り日数（切り上げ。期限当日は1、期限切れは0以下にならず0） */
export function takeoverDaysLeft(pendingAt: Date | string, now: Date): number {
  const start = new Date(pendingAt).getTime();
  const deadline = start + TAKEOVER_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const msLeft = deadline - now.getTime();
  if (msLeft <= 0) return 0;
  return Math.ceil(msLeft / (24 * 60 * 60 * 1000));
}

/** 引き継ぎ先として選べる通常プラン（agency/agency_client/キャンペーンは不可） */
export const TAKEOVER_TARGET_PLAN_IDS = ['light', 'pro', 'business'] as const;
export type TakeoverTargetPlanId = (typeof TAKEOVER_TARGET_PLAN_IDS)[number];

export function isTakeoverTargetPlan(planId: string): planId is TakeoverTargetPlanId {
  return (TAKEOVER_TARGET_PLAN_IDS as readonly string[]).includes(planId);
}

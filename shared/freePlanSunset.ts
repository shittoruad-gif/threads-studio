/**
 * フリープランの終了と、今いるフリーの方の猶予（2026-10-03 三上様「1で進めて」→「10月31日まで」）。
 *
 * - 新しく登録する方：フリープランなし（お申し込み前は、はじめの設定と連携だけ）。
 * - 2026-10-04 0:00（日本時間）より前に登録し、一度も契約したことが無い方：
 *   2026-10-31 いっぱいまで、これまでのフリープラン（投稿3件・AI生成3回/月など）を使える。
 *   不利な変更は効力の日より前に知らせる（民法548条の4・利用規約 第12条）。
 * - 解約した方・クーポン体験が終わった方は猶予の対象外（もともとフリーの方ではない）。
 */
import type { PlanConfig } from './plans';
import { PLANS } from './plans';

/** この時刻より前に登録した方が猶予の対象 */
export const FREE_PLAN_CUTOFF = new Date('2026-10-04T00:00:00+09:00');
/** 猶予の終わり（この時刻を過ぎたら、お申し込み前の扱い） */
export const FREE_PLAN_SUNSET = new Date('2026-11-01T00:00:00+09:00');

/** これまでのフリープランの中身（2026-10-03 まで shared/plans.ts にあったもの） */
export const LEGACY_FREE_PLAN: PlanConfig = {
  ...PLANS.free,
  name: 'フリープラン（10月31日まで）',
  description: '10月31日で終了します。続けてお使いいただくには、7日間無料のお申し込みを',
  features: { ...PLANS.free.features, maxScheduledPosts: 3, maxAiGenerations: 3 },
};

export function inFreeGrace(
  user: { createdAt?: Date | string | null } | null | undefined,
  hasAnySubscriptionRow: boolean,
  now: Date = new Date(),
): boolean {
  if (!user?.createdAt || hasAnySubscriptionRow) return false;
  if (now.getTime() >= FREE_PLAN_SUNSET.getTime()) return false;
  return new Date(user.createdAt as any).getTime() < FREE_PLAN_CUTOFF.getTime();
}

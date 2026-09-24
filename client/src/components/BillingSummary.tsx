import { trpc } from "@/lib/trpc";
import { getPlan } from "@shared/plans";
import { formatDueDate, formatJpDate } from "@shared/contractSummary";
import { useLang } from "@/i18n";

/**
 * ご契約の要点（月額・次回の決済日・金額）。設定画面とダッシュボードで同じものを出す（2026-09-25 三上様指示）。
 *
 * ★次回の決済日は UnivaPay の next_payment が正（server/nextPayment.ts）。
 *   subscriptions.currentPeriodEnd は実測で1日遅いので、次回の決済日には使わない。
 *   読めないときは推測の日付を出さず「確認中」と書く。
 */
export default function BillingSummary({ subscription }: { subscription: any }) {
  const { t } = useLang();
  const contract = subscription?.planId ? getPlan(subscription.planId) : undefined;
  const paying = !!contract && contract.id !== "free" && subscription?.status === "active" && !subscription?.cancelAtPeriodEnd;
  const { data: next, isLoading } = trpc.subscription.nextPayment.useQuery(undefined, {
    enabled: paying || !!subscription?.isPaymentPastDue,
    staleTime: 10 * 60_000,
  });

  const rows: Array<[string, string]> = [];
  if (!contract || contract.id === "free") {
    rows.push([t("お支払い"), t("ありません（無料プラン）")]);
  } else {
    if (typeof contract.priceMonthly === "number" && contract.priceMonthly > 0) {
      rows.push([t("月額"), `${contract.priceMonthly.toLocaleString("ja-JP")}${t("円（税込）")}`]);
    }
    if (subscription?.isTrialing) {
      const end = formatJpDate(subscription?.trialEndsAt);
      rows.push([t("お試し"), end ? `${end}${t("まで無料（初回のお支払いはその翌日）")}` : t("無料でご利用中（お支払いはありません）")]);
    } else if (subscription?.status === "canceled") {
      rows.push([t("お支払い"), t("解約済みです。以後のお支払いはありません")]);
    } else if (subscription?.cancelAtPeriodEnd) {
      const end = formatJpDate(subscription?.currentPeriodEnd);
      rows.push([t("ご利用"), end ? `${end}${t("まで（以後のお支払いはありません）")}` : t("解約を受け付けました（以後のお支払いはありません）")]);
    } else {
      const due = formatDueDate(next?.dueDate);
      rows.push([t("次回の決済日"), due ?? (isLoading ? t("確認しています…") : t("確認中です（決済の記録を確かめています）"))]);
      if (typeof next?.amount === "number") rows.push([t("次回の金額"), `${next.amount.toLocaleString("ja-JP")}${t("円（税込）")}`]);
      if (subscription?.isPaymentPastDue) rows.push([t("お支払い"), t("前回のお支払いを確認中です")]);
    }
    if (subscription?.pendingPlanName) {
      rows.push([t("プラン変更"), `${t("次回のお支払いから")} ${subscription.pendingPlanName} ${t("に切り替わります")}`]);
    }
  }

  return (
    <dl className="mt-3 space-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-wrap gap-x-3">
          <dt className="text-muted-foreground w-28 shrink-0">{k}</dt>
          <dd className="text-foreground font-medium min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

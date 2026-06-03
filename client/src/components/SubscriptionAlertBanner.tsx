import { AlertTriangle, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useLocation } from 'wouter';

/**
 * SubscriptionAlertBanner
 *
 * 決済が失敗している（past_due / unpaid / incomplete）状態のユーザに、
 * ログイン後の全画面トップで警告バナーを表示する。
 *
 * 表示条件:
 *   - subscription.status が past_due / unpaid / incomplete のいずれか
 *
 * アクション:
 *   - 「料金プランを確認」ボタン → /pricing へ。カード再登録（再申込）で復旧できる。
 *     Univapayリンクフォーム方式のため、カード情報のみの更新ポータルは無く、
 *     再申込（新しいカードで再登録）で支払いを復旧する運用とする。
 *
 * 設置場所:
 *   - DashboardLayout の最上部（メインコンテンツの前）。
 */
export function SubscriptionAlertBanner() {
  const { subscription } = useSubscription();
  const [, setLocation] = useLocation();

  if (!subscription) return null;
  const { status, plan } = subscription;
  if (status !== 'past_due' && status !== 'unpaid' && status !== 'incomplete') {
    return null;
  }

  const planName = plan?.name ?? subscription.planId;

  // ステータスごとにメッセージを変える
  const headline =
    status === 'past_due'
      ? '⚠ お支払いができていません'
      : status === 'unpaid'
      ? '⛔ サブスクリプションが停止されています'
      : '⏳ 初回決済が完了していません';

  const detail =
    status === 'past_due'
      ? `${planName}プランの自動更新に失敗しました。Univapay側で数回自動リトライしますが、このままだとサービスが停止します。クレジットカードの有効期限切れ・残高不足が主な原因です。`
      : status === 'unpaid'
      ? `${planName}プランの決済が完了せず、有料機能（自動投稿・無制限AI生成等）が一時停止しています。料金プランから再登録すると再開できます。`
      : `${planName}プランの初回決済が確定していません。カード情報の認証が必要な場合があります。`;

  return (
    <div className="bg-red-500/10 border-b-2 border-red-500/40 px-4 py-3">
      <div className="container mx-auto max-w-7xl flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-red-700 dark:text-red-300">{headline}</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 leading-relaxed">{detail}</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="default"
          className="bg-red-600 hover:bg-red-700 text-white shrink-0"
          onClick={() => setLocation('/pricing')}
        >
          <CreditCard className="h-4 w-4 mr-1" />
          料金プランを確認
        </Button>
      </div>
    </div>
  );
}

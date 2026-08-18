/**
 * 固定投稿ウィザード通知バナー
 *
 * ログイン後のダッシュボード上部に表示する。
 * ユーザーが「確認済み」ボタンを押すか×で閉じると非表示になる。
 * 非表示状態は DB の wizardNotificationSeenAt で管理する（リロードしても戻らない）。
 */
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useLang } from "@/i18n";

export function WizardNotificationBanner() {
  const { t } = useLang();
  const { data, isLoading } = trpc.notification.wizardUnseen.useQuery();
  const markSeen = trpc.notification.markWizardSeen.useMutation();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();

  // 未確認かどうか確定するまで非表示
  if (isLoading || !data?.unseen) return null;

  const handleDismiss = async () => {
    await markSeen.mutateAsync();
    utils.notification.wizardUnseen.invalidate();
  };

  const handleGoToWizard = async () => {
    await markSeen.mutateAsync();
    utils.notification.wizardUnseen.invalidate();
    setLocation("/dashboard");
  };

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-muted-foreground/60 hover:text-foreground transition-colors"
        aria-label={t("閉じる")}
        disabled={markSeen.isPending}
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-emerald-600" />
          </div>
        </div>

        <div className="flex-1 min-w-0 pr-6">
          <p className="font-semibold text-emerald-800 text-sm mb-0.5">
            {t("固定投稿の設定フローが新しくなりました")}
          </p>
          <p className="text-sm text-emerald-700 mb-3 leading-relaxed">
            {t("店舗のURL（公式LINE・Web予約・HPなど）を登録すると、より効果的な固定投稿が自動生成されます。所要時間は約3分です。")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleGoToWizard}
              disabled={markSeen.isPending}
            >
              {t("設定を確認する")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={handleDismiss}
              disabled={markSeen.isPending}
            >
              {t("後で")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

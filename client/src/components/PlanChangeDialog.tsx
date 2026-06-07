import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { getPlan, getFeatureLimitText } from '../../../shared/plans';
import { AlertCircle, Check, X, ArrowUp, ArrowDown } from 'lucide-react';

interface PlanChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlanId: string;
  newPlanId: string;
  onConfirm?: () => void;
}

export function PlanChangeDialog({
  open,
  onOpenChange,
  currentPlanId,
  newPlanId,
  onConfirm,
}: PlanChangeDialogProps) {
  const utils = trpc.useUtils();

  const { data: preview, isLoading: previewLoading } = trpc.univapay.previewPlanChange.useQuery(
    { newPlanId },
    { enabled: open }
  );

  const changePlan = trpc.univapay.changePlan.useMutation({
    onSuccess: (data: { success: boolean; message: string }) => {
      toast.success(data.message);
      onOpenChange(false);
      utils.subscription.getStatus.invalidate();
      onConfirm?.();
    },
    onError: (error: any) => {
      toast.error(`プラン変更に失敗しました: ${error.message}`);
    },
  });

  const currentPlan = getPlan(currentPlanId);
  const newPlan = getPlan(newPlanId);

  if (!currentPlan || !newPlan) {
    return null;
  }

  const handleConfirm = () => {
    changePlan.mutate({ newPlanId });
  };

  const priceDiff = newPlan.priceMonthly - currentPlan.priceMonthly;
  const isUpgrade = priceDiff > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-background border border-border">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-foreground">プラン変更の確認</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isUpgrade ? 'アップグレード' : 'ダウングレード'}の詳細を確認してください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Plan comparison */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">現在のプラン</p>
                <p className="font-semibold text-foreground">{currentPlan.name}</p>
              </div>
              <p className="text-lg font-bold text-foreground">￥{currentPlan.priceMonthly.toLocaleString()}/月</p>
            </div>

            <div className="flex items-center justify-center">
              <div className="text-muted-foreground/60">↓</div>
            </div>

            <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">新しいプラン</p>
                <p className="font-semibold text-foreground">{newPlan.name}</p>
              </div>
              <p className="text-lg font-bold text-emerald-600">￥{newPlan.priceMonthly.toLocaleString()}/月</p>
            </div>
          </div>

          {/* Feature comparison table */}
          <div className="bg-muted/50 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3 text-foreground">機能比較</h3>
            <div className="space-y-2">
              {/* Projects */}
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">プロジェクト数</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground/60">{getFeatureLimitText(currentPlan.features.maxProjects)}</span>
                  {currentPlan.features.maxProjects !== newPlan.features.maxProjects && (
                    isUpgrade ? <ArrowUp className="w-3 h-3 text-emerald-500" /> : <ArrowDown className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`text-sm font-semibold ${
                    currentPlan.features.maxProjects < newPlan.features.maxProjects ? 'text-emerald-600' :
                    currentPlan.features.maxProjects > newPlan.features.maxProjects ? 'text-red-600' :
                    'text-foreground'
                  }`}>
                    {getFeatureLimitText(newPlan.features.maxProjects)}
                  </span>
                </div>
              </div>

              {/* Threads Accounts */}
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Threadsアカウント数</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground/60">{getFeatureLimitText(currentPlan.features.maxThreadsAccounts)}</span>
                  {currentPlan.features.maxThreadsAccounts !== newPlan.features.maxThreadsAccounts && (
                    isUpgrade ? <ArrowUp className="w-3 h-3 text-emerald-500" /> : <ArrowDown className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`text-sm font-semibold ${
                    currentPlan.features.maxThreadsAccounts < newPlan.features.maxThreadsAccounts ? 'text-emerald-600' :
                    currentPlan.features.maxThreadsAccounts > newPlan.features.maxThreadsAccounts ? 'text-red-600' :
                    'text-foreground'
                  }`}>
                    {getFeatureLimitText(newPlan.features.maxThreadsAccounts)}
                  </span>
                </div>
              </div>

              {/* Scheduled Posts */}
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">予約投稿数/月</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground/60">{getFeatureLimitText(currentPlan.features.maxScheduledPosts)}</span>
                  {currentPlan.features.maxScheduledPosts !== newPlan.features.maxScheduledPosts && (
                    isUpgrade ? <ArrowUp className="w-3 h-3 text-emerald-500" /> : <ArrowDown className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`text-sm font-semibold ${
                    currentPlan.features.maxScheduledPosts < newPlan.features.maxScheduledPosts ? 'text-emerald-600' :
                    currentPlan.features.maxScheduledPosts > newPlan.features.maxScheduledPosts ? 'text-red-600' :
                    'text-foreground'
                  }`}>
                    {getFeatureLimitText(newPlan.features.maxScheduledPosts)}
                  </span>
                </div>
              </div>

              {/* AI Generation */}
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">AI文章生成</span>
                <div className="flex items-center gap-3">
                  {currentPlan.features.maxAiGenerations > 0 ? (
                    <Check className="w-4 h-4 text-muted-foreground/60" />
                  ) : (
                    <X className="w-4 h-4 text-muted-foreground/40" />
                  )}
                  {(currentPlan.features.maxAiGenerations > 0) !== (newPlan.features.maxAiGenerations > 0) && (
                    isUpgrade ? <ArrowUp className="w-3 h-3 text-emerald-500" /> : <ArrowDown className="w-3 h-3 text-red-500" />
                  )}
                  {newPlan.features.maxAiGenerations > 0 ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <X className="w-4 h-4 text-red-500" />
                  )}
                </div>
              </div>

              {/* Priority Support */}
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">優先サポート</span>
                <div className="flex items-center gap-3">
                  {currentPlan.features.hasPrioritySupport ? (
                    <Check className="w-4 h-4 text-muted-foreground/60" />
                  ) : (
                    <X className="w-4 h-4 text-muted-foreground/40" />
                  )}
                  {currentPlan.features.hasPrioritySupport !== newPlan.features.hasPrioritySupport && (
                    isUpgrade ? <ArrowUp className="w-3 h-3 text-emerald-500" /> : <ArrowDown className="w-3 h-3 text-red-500" />
                  )}
                  {newPlan.features.hasPrioritySupport ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <X className="w-4 h-4 text-red-500" />
                  )}
                </div>
              </div>

              {/* API Access */}
              {(currentPlan.features.hasApiAccess || newPlan.features.hasApiAccess) && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">APIアクセス</span>
                  <div className="flex items-center gap-3">
                    {currentPlan.features.hasApiAccess ? (
                      <Check className="w-4 h-4 text-muted-foreground/60" />
                    ) : (
                      <X className="w-4 h-4 text-muted-foreground/40" />
                    )}
                    {currentPlan.features.hasApiAccess !== newPlan.features.hasApiAccess && (
                      isUpgrade ? <ArrowUp className="w-3 h-3 text-emerald-500" /> : <ArrowDown className="w-3 h-3 text-red-500" />
                    )}
                    {newPlan.features.hasApiAccess ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <X className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Price difference */}
          {preview && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">月額料金の差額</p>
                <p className={`text-lg font-bold ${isUpgrade ? 'text-emerald-600' : 'text-red-600'}`}>
                  {isUpgrade ? '+' : ''}¥{Math.abs(priceDiff).toLocaleString()}/月
                </p>
              </div>
              {preview.daysRemaining > 0 && (
                <p className="text-xs text-muted-foreground/60 mt-1">
                  残り{preview.daysRemaining}日間の日割り計算: ¥{Math.abs(preview.proratedAmount).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Note */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">変更のタイミングについて</p>
              <p>プランは確定後すぐに切り替わり、<strong>次回のお支払いから新しいプランの金額</strong>が適用されます。
              （キャンペーンプランへの変更・からの変更はこの画面では行えません。料金プランから新規にお申し込みください。）</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={changePlan.isPending}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={changePlan.isPending || previewLoading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {changePlan.isPending ? '処理中...' : 'プラン変更を確定'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

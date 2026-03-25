import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { PLANS, getPlan, getFeatureLimitText } from '../../../shared/plans';
import { AlertCircle, Zap, Clock, Check, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useState, useEffect } from 'react';

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
  const [changeTiming, setChangeTiming] = useState<'immediate' | 'next_period'>('immediate');

  const { data: preview, isLoading: previewLoading } = trpc.univapay.previewPlanChange.useQuery(
    { newPlanId },
    { enabled: open }
  );

  const changePlan = trpc.univapay.changePlan.useMutation({
    onSuccess: (data: { success: boolean; changeTiming: string; message: string; effectiveDate?: Date }) => {
      toast.success(data.message);
      
      if (data.changeTiming === 'immediate') {
        const linkFormUrl = process.env[`VITE_UNIVAPAY_LINK_${newPlanId.toUpperCase()}`];
        if (linkFormUrl) {
          toast.info('新しいプランの決済ページに移動します...');
          window.open(linkFormUrl, '_blank');
        }
      }
      
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
    changePlan.mutate({ newPlanId, changeTiming });
  };

  const priceDiff = newPlan.priceMonthly - currentPlan.priceMonthly;
  const isUpgrade = priceDiff > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-white border border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-900">プラン変更の確認</DialogTitle>
          <DialogDescription className="text-gray-500">
            {isUpgrade ? 'アップグレード' : 'ダウングレード'}の詳細を確認してください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Plan comparison */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-500">現在のプラン</p>
                <p className="font-semibold text-gray-900">{currentPlan.name}</p>
              </div>
              <p className="text-lg font-bold text-gray-900">￥{currentPlan.priceMonthly.toLocaleString()}/月</p>
            </div>

            <div className="flex items-center justify-center">
              <div className="text-gray-400">↓</div>
            </div>

            <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div>
                <p className="text-sm text-gray-500">新しいプラン</p>
                <p className="font-semibold text-gray-900">{newPlan.name}</p>
              </div>
              <p className="text-lg font-bold text-emerald-600">￥{newPlan.priceMonthly.toLocaleString()}/月</p>
            </div>
          </div>

          {/* Feature comparison table */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3 text-gray-900">機能比較</h3>
            <div className="space-y-2">
              {/* Projects */}
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <span className="text-sm text-gray-600">プロジェクト数</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">{getFeatureLimitText(currentPlan.features.maxProjects)}</span>
                  {currentPlan.features.maxProjects !== newPlan.features.maxProjects && (
                    isUpgrade ? <ArrowUp className="w-3 h-3 text-emerald-500" /> : <ArrowDown className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`text-sm font-semibold ${
                    currentPlan.features.maxProjects < newPlan.features.maxProjects ? 'text-emerald-600' :
                    currentPlan.features.maxProjects > newPlan.features.maxProjects ? 'text-red-600' :
                    'text-gray-900'
                  }`}>
                    {getFeatureLimitText(newPlan.features.maxProjects)}
                  </span>
                </div>
              </div>

              {/* Threads Accounts */}
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <span className="text-sm text-gray-600">Threadsアカウント数</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">{getFeatureLimitText(currentPlan.features.maxThreadsAccounts)}</span>
                  {currentPlan.features.maxThreadsAccounts !== newPlan.features.maxThreadsAccounts && (
                    isUpgrade ? <ArrowUp className="w-3 h-3 text-emerald-500" /> : <ArrowDown className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`text-sm font-semibold ${
                    currentPlan.features.maxThreadsAccounts < newPlan.features.maxThreadsAccounts ? 'text-emerald-600' :
                    currentPlan.features.maxThreadsAccounts > newPlan.features.maxThreadsAccounts ? 'text-red-600' :
                    'text-gray-900'
                  }`}>
                    {getFeatureLimitText(newPlan.features.maxThreadsAccounts)}
                  </span>
                </div>
              </div>

              {/* Scheduled Posts */}
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <span className="text-sm text-gray-600">予約投稿数/月</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">{getFeatureLimitText(currentPlan.features.maxScheduledPosts)}</span>
                  {currentPlan.features.maxScheduledPosts !== newPlan.features.maxScheduledPosts && (
                    isUpgrade ? <ArrowUp className="w-3 h-3 text-emerald-500" /> : <ArrowDown className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`text-sm font-semibold ${
                    currentPlan.features.maxScheduledPosts < newPlan.features.maxScheduledPosts ? 'text-emerald-600' :
                    currentPlan.features.maxScheduledPosts > newPlan.features.maxScheduledPosts ? 'text-red-600' :
                    'text-gray-900'
                  }`}>
                    {getFeatureLimitText(newPlan.features.maxScheduledPosts)}
                  </span>
                </div>
              </div>

              {/* AI Generation */}
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <span className="text-sm text-gray-600">AI文章生成</span>
                <div className="flex items-center gap-3">
                  {currentPlan.features.maxAiGenerations > 0 ? (
                    <Check className="w-4 h-4 text-gray-400" />
                  ) : (
                    <X className="w-4 h-4 text-gray-300" />
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
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <span className="text-sm text-gray-600">優先サポート</span>
                <div className="flex items-center gap-3">
                  {currentPlan.features.hasPrioritySupport ? (
                    <Check className="w-4 h-4 text-gray-400" />
                  ) : (
                    <X className="w-4 h-4 text-gray-300" />
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
                  <span className="text-sm text-gray-600">APIアクセス</span>
                  <div className="flex items-center gap-3">
                    {currentPlan.features.hasApiAccess ? (
                      <Check className="w-4 h-4 text-gray-400" />
                    ) : (
                      <X className="w-4 h-4 text-gray-300" />
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
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">月額料金の差額</p>
                <p className={`text-lg font-bold ${isUpgrade ? 'text-emerald-600' : 'text-red-600'}`}>
                  {isUpgrade ? '+' : ''}¥{Math.abs(priceDiff).toLocaleString()}/月
                </p>
              </div>
              {preview.daysRemaining > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  残り{preview.daysRemaining}日間の日割り計算: ¥{Math.abs(preview.proratedAmount).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Change timing selection */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-gray-900">変更タイミングを選択</Label>
            <RadioGroup value={changeTiming} onValueChange={(value) => setChangeTiming(value as 'immediate' | 'next_period')}>
              <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg border-2 border-transparent hover:border-emerald-300 transition-colors cursor-pointer"
                   onClick={() => setChangeTiming('immediate')}>
                <RadioGroupItem value="immediate" id="immediate" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="immediate" className="flex items-center gap-2 font-semibold cursor-pointer text-gray-900">
                    <Zap className="w-4 h-4 text-yellow-500" />
                    即座に変更
                  </Label>
                  <p className="text-xs text-gray-500 mt-1">
                    現在のサブスクリプションをキャンセルし、新しいプランの決済ページに移動します。
                    {isUpgrade && preview && preview.proratedAmount > 0 && (
                      <span className="block mt-1 text-yellow-600">
                        日割り計算で約¥{preview.proratedAmount.toLocaleString()}の追加料金が発生します。
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg border-2 border-transparent hover:border-emerald-300 transition-colors cursor-pointer"
                   onClick={() => setChangeTiming('next_period')}>
                <RadioGroupItem value="next_period" id="next_period" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="next_period" className="flex items-center gap-2 font-semibold cursor-pointer text-gray-900">
                    <Clock className="w-4 h-4 text-blue-500" />
                    次回請求時に変更
                  </Label>
                  <p className="text-xs text-gray-500 mt-1">
                    現在の請求期間が終了するまで現在のプランを継続し、次回請求時に新しいプランに変更します。
                    {preview && preview.daysRemaining > 0 && (
                      <span className="block mt-1 text-blue-600">
                        あと{preview.daysRemaining}日間は現在のプランを利用できます。
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Warning */}
          {changeTiming === 'immediate' && (
            <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-semibold mb-1">重要なお知らせ</p>
                <p>即座に変更する場合、現在のサブスクリプションはキャンセルされ、新しいプランの決済ページに移動します。</p>
              </div>
            </div>
          )}
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

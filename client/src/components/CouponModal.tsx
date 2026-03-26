import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface CouponModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CouponModal({ open, onClose, onSuccess }: CouponModalProps) {
  const [couponCode, setCouponCode] = useState("");
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    message: string;
    type?: string;
    duration?: number;
  } | null>(null);

  const utils = trpc.useUtils();

  // Validate coupon code
  const validateMutation = trpc.coupon.validate.useQuery(
    { code: couponCode.trim().toUpperCase() },
    {
      enabled: false,
    }
  );

  // Handle validation result
  if (validateMutation.data && !validationResult) {
    const data = validateMutation.data;
    if (data.valid && data.coupon) {
      setValidationResult({
        valid: true,
        message: data.coupon.description || "有効なクーポンコードです",
        type: data.coupon.type,
        duration: data.coupon.type === "trial_30" ? 30 : data.coupon.type === "trial_14" ? 14 : undefined,
      });
    } else {
      setValidationResult({
        valid: false,
        message: data.error || "無効なクーポンコードです",
      });
    }
  }
  if (validateMutation.error && !validationResult) {
    setValidationResult({
      valid: false,
      message: "クーポンコードの検証に失敗しました",
    });
  }

  // Apply coupon code
  const applyMutation = trpc.coupon.applyCode.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        // Invalidate subscription status to refresh
        utils.subscription.getStatus.invalidate();
        
        if (onSuccess) {
          onSuccess();
        }
        
        // Close modal after short delay
        setTimeout(() => {
          onClose();
          setCouponCode("");
          setValidationResult(null);
        }, 2000);
      } else {
        setValidationResult({
          valid: false,
          message: data.message || "クーポンの適用に失敗しました",
        });
      }
    },
    onError: (error) => {
      setValidationResult({
        valid: false,
        message: error.message || "クーポンの適用に失敗しました",
      });
    },
  });

  const handleValidate = () => {
    if (!couponCode.trim()) {
      setValidationResult({
        valid: false,
        message: "クーポンコードを入力してください",
      });
      return;
    }
    validateMutation.refetch();
  };

  const handleApply = () => {
    if (!couponCode.trim()) return;
    applyMutation.mutate({ code: couponCode.trim().toUpperCase() });
  };

  const handleClose = () => {
    onClose();
    setCouponCode("");
    setValidationResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl gradient-text">
            <Sparkles className="w-6 h-6" />
            クーポンコードを適用
          </DialogTitle>
          <DialogDescription>
            お持ちのクーポンコードを入力して、特別なプランをご利用ください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="coupon-code">クーポンコード</Label>
            <Input
              id="coupon-code"
              placeholder="クーポンコードを入力"
              value={couponCode}
              onChange={(e) => {
                setCouponCode(e.target.value.toUpperCase());
                setValidationResult(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleValidate();
                }
              }}
              className="font-mono text-lg"
              disabled={applyMutation.isPending}
            />
          </div>

          {validationResult && (
            <Alert
              variant={validationResult.valid ? "default" : "destructive"}
              className={validationResult.valid ? "border-green-500 bg-green-500/10" : ""}
            >
              {validationResult.valid ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {validationResult.message}
                {validationResult.valid && validationResult.type && (
                  <div className="mt-2 text-sm">
                    {validationResult.type === "forever_free" && (
                      <p className="font-medium">✨ 永久無料プランが適用されます（全機能無制限）</p>
                    )}
                    {validationResult.type === "special_price" && (
                      <p className="font-medium">🎁 特別価格！180日間プロプランが無料になります</p>
                    )}
                    {validationResult.type === "discount_50" && (
                      <p className="font-medium">🎉 50%OFF！90日間プロプランが無料になります</p>
                    )}
                    {validationResult.type === "discount_30" && (
                      <p className="font-medium">💫 30%OFF！60日間プロプランが無料になります</p>
                    )}
                    {validationResult.type === "trial_30" && (
                      <p className="font-medium">🎁 30日間無料トライアルが開始されます</p>
                    )}
                    {validationResult.type === "trial_14" && (
                      <p className="font-medium">🎁 14日間無料トライアルが開始されます</p>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {applyMutation.isSuccess && applyMutation.data.success && (
            <Alert className="border-green-500 bg-green-500/10">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-500">
                クーポンが正常に適用されました！
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            {!validationResult?.valid ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={applyMutation.isPending}
                  className="flex-1"
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleValidate}
                  disabled={!couponCode.trim() || validateMutation.isFetching}
                  className="flex-1 neon-border"
                >
                  {validateMutation.isFetching ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      確認中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      確認
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={applyMutation.isPending}
                  className="flex-1"
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={applyMutation.isPending}
                  className="flex-1 neon-border"
                >
                  {applyMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      適用中...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      適用する
                    </>
                  )}
                </Button>
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            クーポンコードをお持ちの方は上記に入力してください
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

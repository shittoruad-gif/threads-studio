import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Loader2, Tag } from 'lucide-react';

interface CouponInputProps {
  onSuccess?: () => void;
}

export function CouponInput({ onSuccess }: CouponInputProps) {
  const [code, setCode] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  const applyCouponMutation = trpc.coupon.applyCode.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setCode('');
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      setIsApplying(false);
    },
  });

  const handleApply = async () => {
    if (!code.trim()) {
      toast.error('キャンペーンコードを入力してください');
      return;
    }

    setIsApplying(true);
    applyCouponMutation.mutate({ code: code.trim().toUpperCase() });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Tag className="w-5 h-5 text-emerald-600" />
        <h3 className="text-lg font-semibold text-gray-900">キャンペーンコード</h3>
      </div>
      
      <p className="text-sm text-gray-500 mb-4">
        キャンペーンコードをお持ちの方は、こちらに入力してください。
      </p>

      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="コードを入力"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleApply();
            }
          }}
          className="flex-1"
          disabled={isApplying}
        />
        <Button
          onClick={handleApply}
          disabled={isApplying || !code.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {isApplying ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              適用中...
            </>
          ) : (
            '適用'
          )}
        </Button>
      </div>
    </div>
  );
}

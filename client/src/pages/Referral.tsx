import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Gift, Users, Coins, Check } from "lucide-react";
import { toast } from "sonner";

export default function Referral() {
  const [, setLocation] = useLocation();
  const { data: user } = trpc.auth.me.useQuery();
  const [copied, setCopied] = useState(false);

  const { data: referralData, isLoading: referralLoading } = trpc.referral.getMyReferralInfo.useQuery();
  const { data: creditsData, isLoading: creditsLoading } = trpc.referral.getMyCredits.useQuery();
  const { data: referralHistory, isLoading: historyLoading } = trpc.referral.getReferralHistory.useQuery();
  const { data: creditHistory, isLoading: creditHistoryLoading } = trpc.referral.getCreditHistory.useQuery();

  const handleCopyReferralCode = () => {
    if (referralData?.referralCode) {
      navigator.clipboard.writeText(referralData.referralCode);
      setCopied(true);
      toast.success("紹介コードをコピーしました");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyReferralLink = () => {
    if (referralData?.referralCode) {
      const referralLink = `${window.location.origin}/register?ref=${referralData.referralCode}`;
      navigator.clipboard.writeText(referralLink);
      toast.success("紹介リンクをコピーしました");
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">ログインが必要です</p>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setLocation("/login")}>ログイン</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium mb-2">
          <Gift className="w-4 h-4" />
          REFERRAL
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">紹介プログラム</h1>
        <p className="text-muted-foreground">友達を紹介してクレジットを獲得しましょう</p>
      </div>

      {/* Referral Code Card */}
      <div className="bg-background border-2 border-emerald-200 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-emerald-50">
            <Gift className="w-5 h-5 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">あなたの紹介コード</h2>
        </div>
        
        {referralLoading ? (
          <div className="animate-pulse">
            <div className="h-12 bg-muted rounded mb-4"></div>
          </div>
        ) : referralData?.referralCode ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-muted/50 border border-border rounded-lg p-4">
                <p className="text-2xl font-mono font-bold text-foreground text-center">
                  {referralData.referralCode}
                </p>
              </div>
              <Button
                onClick={handleCopyReferralCode}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <Button
              onClick={handleCopyReferralLink}
              variant="outline"
              className="w-full border-emerald-200 text-emerald-600 hover:bg-emerald-50"
            >
              紹介リンクをコピー
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              友達がこのコードで登録すると、あなたと友達の両方にクレジットが付与されます
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">紹介コードを生成中...</p>
        )}
      </div>

      {/* Credits Card */}
      <div className="bg-background border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-50">
            <Coins className="w-5 h-5 text-amber-600" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">クレジット残高</h2>
        </div>
        {creditsLoading ? (
          <div className="animate-pulse">
            <div className="h-16 bg-muted rounded"></div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-4xl font-bold text-amber-600 mb-2">
              {creditsData?.credits || 0}
            </p>
            <p className="text-muted-foreground text-sm">利用可能なクレジット</p>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Referral History */}
        <div className="bg-background border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-50">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">紹介履歴</h2>
          </div>
          {historyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse h-16 bg-muted rounded"></div>
              ))}
            </div>
          ) : referralHistory && referralHistory.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {referralHistory.map((referral) => (
                <div
                  key={referral.id}
                  className="bg-muted/50 border border-border/50 rounded-lg p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-foreground font-medium">紹介成功</p>
                      <p className="text-muted-foreground text-sm">
                        {new Date(referral.createdAt).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">
                      +{referral.referrerReward}クレジット
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">まだ紹介履歴がありません</p>
              <p className="text-muted-foreground/60 text-sm mt-2">
                友達を紹介してクレジットを獲得しましょう
              </p>
            </div>
          )}
        </div>

        {/* Credit Transaction History */}
        <div className="bg-background border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-amber-50">
              <Coins className="w-5 h-5 text-amber-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">クレジット履歴</h2>
          </div>
          {creditHistoryLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse h-16 bg-muted rounded"></div>
              ))}
            </div>
          ) : creditHistory && creditHistory.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {creditHistory.map((transaction) => (
                <div
                  key={transaction.id}
                  className="bg-muted/50 border border-border/50 rounded-lg p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-foreground font-medium">
                        {transaction.type === 'referral_bonus' && '紹介ボーナス'}
                        {transaction.type === 'referred_bonus' && '被紹介ボーナス'}
                        {transaction.type === 'referral_reward' && '紹介報酬'}
                        {transaction.type === 'purchase' && '購入'}
                        {transaction.type === 'usage' && '使用'}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {new Date(transaction.createdAt).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                    <Badge
                      className={
                        transaction.amount > 0
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }
                    >
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                    </Badge>
                  </div>
                  {transaction.description && (
                    <p className="text-muted-foreground/60 text-sm">{transaction.description}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Coins className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">まだクレジット履歴がありません</p>
            </div>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="bg-background border border-border rounded-xl p-6 mt-6">
        <h2 className="text-lg font-semibold text-foreground mb-6">紹介プログラムの仕組み</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="text-center p-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-emerald-600">1</span>
            </div>
            <h3 className="font-semibold text-foreground mb-2">コードを共有</h3>
            <p className="text-muted-foreground text-sm">
              あなたの紹介コードを友達に共有します
            </p>
          </div>
          <div className="text-center p-4">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-blue-600">2</span>
            </div>
            <h3 className="font-semibold text-foreground mb-2">友達が登録</h3>
            <p className="text-muted-foreground text-sm">
              友達があなたのコードで登録します
            </p>
          </div>
          <div className="text-center p-4">
            <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-amber-600">3</span>
            </div>
            <h3 className="font-semibold text-foreground mb-2">クレジット獲得</h3>
            <p className="text-muted-foreground text-sm">
              あなたと友達の両方にクレジットが付与されます
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

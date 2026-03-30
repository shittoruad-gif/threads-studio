import { AlertCircle, Clock, Crown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { useLocation } from "wouter";

interface TrialBannerProps {
  trialEndsAt: Date | string;
  planName: string;
}

export default function TrialBanner({ trialEndsAt, planName }: TrialBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [, setLocation] = useLocation();

  if (dismissed) return null;

  const endDate = new Date(trialEndsAt);
  const now = new Date();
  const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60));

  if (daysRemaining < 0) return null;

  const totalDays = 30;
  const progressPercentage = Math.max(0, Math.min(100, ((totalDays - daysRemaining) / totalDays) * 100));

  let bgColor = "bg-blue-50";
  let borderColor = "border-blue-200";
  let textColor = "text-blue-600";
  let iconColor = "text-blue-500";
  let message = "";

  if (daysRemaining <= 1) {
    bgColor = "bg-red-50";
    borderColor = "border-red-200";
    textColor = "text-red-600";
    iconColor = "text-red-500";
    message = hoursRemaining <= 24 
      ? `トライアルは本日終了します（残り${hoursRemaining}時間）`
      : "トライアルは明日終了します";
  } else if (daysRemaining <= 3) {
    bgColor = "bg-yellow-50";
    borderColor = "border-yellow-200";
    textColor = "text-yellow-700";
    iconColor = "text-yellow-500";
    message = `トライアル終了まであと${daysRemaining}日`;
  } else if (daysRemaining <= 7) {
    bgColor = "bg-orange-50";
    borderColor = "border-orange-200";
    textColor = "text-orange-600";
    iconColor = "text-orange-500";
    message = `トライアル終了まであと${daysRemaining}日`;
  } else {
    message = `トライアル終了まであと${daysRemaining}日`;
  }

  return (
    <div className={`${bgColor} ${borderColor} border rounded-xl p-4 mb-6 relative`}>
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-muted-foreground/60 hover:text-foreground transition-colors"
        aria-label="閉じる"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-4">
        <div className={`${iconColor} flex-shrink-0 mt-1`}>
          {daysRemaining <= 3 ? (
            <AlertCircle className="w-6 h-6" />
          ) : (
            <Clock className="w-6 h-6" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className={`font-semibold ${textColor}`}>{message}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {planName}
            </span>
          </div>

          <p className="text-sm text-muted-foreground mb-3">
            トライアル終了日: {endDate.toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>

          <div className="mb-3">
            <Progress 
              value={progressPercentage} 
              className="h-2 bg-muted"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setLocation('/pricing')}
            >
              <Crown className="w-4 h-4 mr-2" />
              プランを選択
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setDismissed(true)}
            >
              後で
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UsageProgressProps {
  label: string;
  current: number;
  limit: number;
  icon?: React.ReactNode;
  className?: string;
}

export function UsageProgress({
  label,
  current,
  limit,
  icon,
  className = '',
}: UsageProgressProps) {
  const percentage = limit === -1 ? 0 : Math.min((current / limit) * 100, 100);
  const isUnlimited = limit === -1;
  
  const getColor = () => {
    if (isUnlimited) return 'text-emerald-600';
    if (percentage >= 100) return 'text-red-600';
    if (percentage >= 80) return 'text-yellow-600';
    return 'text-emerald-600';
  };

  const getProgressColor = () => {
    if (isUnlimited) return 'bg-emerald-500';
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 80) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  const getStatusIcon = () => {
    if (isUnlimited) return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (percentage >= 100) return <AlertCircle className="w-4 h-4 text-red-500" />;
    if (percentage >= 80) return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && <div className="text-muted-foreground">{icon}</div>}
          <span className="text-sm font-medium text-foreground/80">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className={cn('text-sm font-semibold', getColor())}>
            {current} / {isUnlimited ? '無制限' : limit}
          </span>
        </div>
      </div>
      
      {!isUnlimited && (
        <div className="space-y-1">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <div 
              className={cn('h-full transition-all rounded-full', getProgressColor())}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{percentage.toFixed(0)}% 使用中</span>
            {percentage >= 80 && percentage < 100 && (
              <span className="text-yellow-600">上限に近づいています</span>
            )}
            {percentage >= 100 && (
              <span className="text-red-600">上限に達しました</span>
            )}
          </div>
        </div>
      )}
      
      {isUnlimited && (
        <div className="text-xs text-emerald-600">
          無制限に利用できます
        </div>
      )}
    </div>
  );
}

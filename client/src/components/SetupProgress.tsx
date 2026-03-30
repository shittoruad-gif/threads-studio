import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ArrowRight, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

interface StatusItem {
  id: string;
  label: string;
  completed: boolean;
  actionLabel?: string;
  action?: () => void;
  warning?: boolean;
}

export function SetupProgress() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { data: projects } = trpc.project.list.useQuery();
  const { data: threadsAccounts } = trpc.threads.list.useQuery();
  const { data: demoModeData } = trpc.setup.getDemoMode.useQuery();
  const { data: autoPostSettings } = trpc.autoPost.getSettings.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const hasProjects = (projects?.length ?? 0) > 0;
  const hasThreadsAccounts = (threadsAccounts?.length ?? 0) > 0;
  const isAutoPostEnabled = autoPostSettings?.autoPostEnabled ?? false;
  const isDemoMode = demoModeData?.isDemoMode ?? true;

  const statusItems: StatusItem[] = [
    {
      id: "account",
      label: "アカウント作成済み",
      completed: true,
    },
    {
      id: "threads",
      label: "Threads連携",
      completed: hasThreadsAccounts,
      actionLabel: "連携する",
      action: () => setLocation("/threads-connect"),
    },
    {
      id: "project",
      label: "プロジェクト設定",
      completed: hasProjects,
      actionLabel: "設定する",
      action: () => setLocation("/ai-project-create"),
    },
    {
      id: "autopost",
      label: "自動投稿",
      completed: isAutoPostEnabled,
      actionLabel: "ONにする",
      action: () => setLocation("/dashboard"),
      warning: !isAutoPostEnabled && hasProjects && hasThreadsAccounts,
    },
  ];

  const completedCount = statusItems.filter((s) => s.completed).length;
  const totalCount = statusItems.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  // Hide when fully complete and not in demo mode
  if (completedCount === totalCount && !isDemoMode) {
    return null;
  }

  return (
    <Card className="mb-6 overflow-hidden border-0 shadow-sm">
      {/* Header with warm gradient */}
      <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-foreground">セットアップ状況</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completedCount === totalCount
                ? "すべて完了しました！"
                : `あと${totalCount - completedCount}項目で準備完了です`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-amber-600">
              {progressPercent}%
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-white/60 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progressPercent}%`,
              background:
                progressPercent === 100
                  ? "linear-gradient(90deg, #22c55e, #16a34a)"
                  : "linear-gradient(90deg, #f59e0b, #f97316)",
            }}
          />
        </div>
      </div>

      {/* Status items */}
      <div className="px-5 py-3 divide-y divide-border/30">
        {statusItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 py-2.5"
          >
            {/* Status indicator */}
            {item.completed ? (
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
            ) : item.warning ? (
              <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-amber-500" />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Circle className="w-4 h-4 text-red-400" />
              </div>
            )}

            {/* Label */}
            <span
              className={`flex-1 text-sm ${
                item.completed
                  ? "text-muted-foreground"
                  : "text-foreground font-medium"
              }`}
            >
              {item.label}
            </span>

            {/* Action button */}
            {!item.completed && item.action && (
              <Button
                size="sm"
                variant="outline"
                onClick={item.action}
                className={`h-7 text-xs px-3 flex-shrink-0 ${
                  item.warning
                    ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                    : "border-red-200 text-red-600 hover:bg-red-50"
                }`}
              >
                {item.actionLabel}
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            )}

            {/* Completed badge */}
            {item.completed && (
              <span className="text-xs text-emerald-600 font-medium flex-shrink-0">
                完了
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

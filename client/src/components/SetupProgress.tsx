import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ArrowRight, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLang } from "@/i18n";

interface StatusItem {
  id: string;
  label: string;
  completed: boolean;
  actionLabel?: string;
  action?: () => void;
  warning?: boolean;
}

export function SetupProgress() {
  const { t, lang } = useLang();
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { data: projects } = trpc.project.list.useQuery();
  const { data: threadsAccounts } = trpc.threads.list.useQuery();
  const { data: demoModeData } = trpc.setup.getDemoMode.useQuery();
  const { data: autoPostSettings } = trpc.autoPost.getSettings.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const { data: aiHistory } = trpc.project.getAiHistory.useQuery(
    { limit: 1, offset: 0 },
    { enabled: isAuthenticated }
  );
  // 教科書の流れ：集客の入口である「固定投稿」を最初に作る
  const { data: pinnedData } = trpc.project.hasPinnedPost.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  // 工程の一覧（判定はサーバー側。アプリ・LINE・メールで同じものを見る）
  const { data: setup } = trpc.support.setupSteps.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const hasProjects = (projects?.length ?? 0) > 0;
  const hasThreadsAccounts = (threadsAccounts?.length ?? 0) > 0;
  const hasGenerated = (aiHistory?.total ?? 0) > 0;
  const hasPinnedPost = pinnedData?.hasPinnedPost ?? false;
  void hasGenerated;
  // 工程の判定はサーバー側（getSetupSteps）に移した。下の変数は他の表示で使う。
  void hasPinnedPost; void hasProjects; void hasThreadsAccounts;

  // 固定投稿の生成画面へ。プロジェクト未登録なら先に店舗情報登録へ誘導。
  const goCreatePinned = () => {
    const firstProject = projects?.[0];
    if (firstProject) {
      window.location.href = `/ai-generate?project=${firstProject.id}&postType=pinned`;
    } else {
      setLocation("/ai-project-create");
    }
  };
  const isAutoPostEnabled = autoPostSettings?.autoPostEnabled ?? false;
  const isDemoMode = demoModeData?.isDemoMode ?? true;
  // 公式LINEの友だち追加URL（「はじめの設定」はLINEのトークで進めるのを推奨するため）
  const lineStatus = trpc.lineNotify.getStatus.useQuery(undefined, { retry: false });
  const lineAddUrl: string | null = (lineStatus.data as any)?.addFriendUrl ?? null;

  // 自動投稿カードまでスクロールして注目させる（ダッシュボード内のトグルへ誘導）
  const scrollToAutoPost = () => {
    setLocation("/dashboard");
    setTimeout(() => {
      const el = document.querySelector('[data-tour="auto-post"]');
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  };

  // ★工程の判定はサーバー（server/nextAction.ts の getSetupSteps）に一本化している。
  //   ここで条件を書き直すと、公式LINE・メールの案内とすぐ食い違う。
  //   （以前は画面側で別々に判定していたため、「LINEでは紐づけが要ると言っているのに
  //     アプリでは準備完了」という状態が起きていた）
  const statusItems: StatusItem[] = (setup?.steps ?? []).map((s: any) => ({
    id: s.id,
    label: s.label,
    completed: s.done,
    ...(s.done ? {} : {
      actionLabel: s.actionLabel ?? "進む",
      action: s.id === "pinned" || s.id === "no_pinned"
        ? goCreatePinned
        : s.id === "auto_off"
          ? scrollToAutoPost
          : () => setLocation(s.path ?? "/dashboard"),
      warning: Boolean(s.important),
    }),
  }));

  // 次にやるべき1ステップ（最初の未完了）
  const nextStep = statusItems.find((s) => !s.completed && s.action);

  const completedCount = statusItems.filter((s) => s.completed).length;
  const totalCount = statusItems.length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  // 工程がまだ取れていないうちは何も出さない（「0%」が一瞬見えないように）
  if (totalCount === 0) return null;
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
            <h3 className="text-base font-bold text-foreground">{t("セットアップ状況")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completedCount === totalCount
                ? t("すべて完了しました！")
                : (lang === "en"
                    ? `${totalCount - completedCount} step(s) left to finish setup`
                    : `あと${totalCount - completedCount}項目で準備完了です`)}
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
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Circle className="w-4 h-4 text-muted-foreground/50" />
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
              {t(item.label)}
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
                    : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                {t(item.actionLabel ?? "")}
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            )}

            {/* Completed badge */}
            {item.completed && (
              <span className="text-xs text-emerald-600 font-medium flex-shrink-0">
                {t("完了")}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ★はじめの設定はLINEのトークで進めるのを推奨（2026-09-03 三上様指示）。
          アプリの画面より、スマホのLINEで質問に答えるほうが途中で止まりにくい。 */}
      {nextStep?.id === "no_project" && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 leading-relaxed">
          <span className="font-semibold">{t("おすすめ：")}</span>
          {t("「お店の情報」は公式LINEのトークで答えるのがいちばん簡単です。友だち追加のあと、メニューの「はじめの設定」を押してください。")}
          {lineAddUrl && (
            <a
              href={lineAddUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-1 underline font-semibold text-emerald-700"
            >
              {t("公式LINEを友だち追加")}
            </a>
          )}
        </div>
      )}

      {/* 次にやること（最重要の1アクションを大きく提示） */}
      {nextStep && (
        <div className="px-5 pb-5 pt-1">
          <Button
            onClick={nextStep.action}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11"
          >
            {t("次にやること")}: {t(nextStep.label)}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </Card>
  );
}

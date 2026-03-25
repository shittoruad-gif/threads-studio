import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

interface SetupTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action?: () => void;
  actionLabel?: string;
}

export function SetupProgress() {
  const [, setLocation] = useLocation();
  const { data: projects } = trpc.project.list.useQuery();
  const { data: threadsAccounts } = trpc.threads.list.useQuery();
  const { data: demoModeData } = trpc.setup.getDemoMode.useQuery();

  const hasProjects = (projects?.length ?? 0) > 0;
  const hasThreadsAccounts = (threadsAccounts?.length ?? 0) > 0;
  const isDemoMode = demoModeData?.isDemoMode ?? true;

  const tasks: SetupTask[] = [
    {
      id: "project",
      title: "プロジェクトを作成",
      description: "投稿内容のベースとなるプロジェクトを作成しましょう",
      completed: hasProjects,
      action: () => setLocation("/ai-project-create"),
      actionLabel: "プロジェクト作成",
    },
    {
      id: "threads",
      title: "Threadsアカウント連携",
      description: "実際に投稿するためにThreadsアカウントを連携しましょう",
      completed: hasThreadsAccounts,
      action: () => setLocation("/threads-connect"),
      actionLabel: "アカウント連携",
    },
    {
      id: "generate",
      title: "最初の投稿を生成",
      description: "AIを使って最初の投稿を生成してみましょう",
      completed: false, // TODO: 生成履歴から判定
      action: () => setLocation("/ai-generate"),
      actionLabel: "投稿生成",
    },
  ];

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const progress = (completedCount / totalCount) * 100;

  // 全て完了している場合は表示しない
  if (completedCount === totalCount && !isDemoMode) {
    return null;
  }

  return (
    <Card className="p-6 mb-6 glass-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">セットアップ進捗</h3>
          <p className="text-sm text-muted-foreground">
            あと{totalCount - completedCount}ステップで投稿できます
          </p>
        </div>
        <div className="text-2xl font-bold text-primary">
          {completedCount}/{totalCount}
        </div>
      </div>

      <Progress value={progress} className="mb-6" />

      <div className="space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
          >
            {task.completed ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            ) : (
              <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <h4
                className={`font-medium ${
                  task.completed ? "text-muted-foreground line-through" : ""
                }`}
              >
                {task.title}
              </h4>
              <p className="text-sm text-muted-foreground">{task.description}</p>
            </div>
            {!task.completed && task.action && (
              <Button
                size="sm"
                variant="outline"
                onClick={task.action}
                className="flex-shrink-0"
              >
                {task.actionLabel}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft, Sparkles, Loader2, Check, RefreshCw, PartyPopper,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * AIスタイル校正画面
 *
 * URL: /ai-style-calibration?project=<projectId>
 *
 * 流れ:
 *  1. サーバから 6 個のサンプル投稿（業界・地域・ターゲットを差し込み済み）を受け取る
 *  2. ユーザは雰囲気が好きなものを 1〜3 個タップして選択
 *  3. 「この雰囲気で進める」を押すと選択された ID が保存され、
 *     以降の AI 生成に「ユーザはこういう書き方を好む」として反映される
 *  4. 「別のサンプルを見る」で6個を再生成（LLM 呼び出しなし・テンプレからランダムピック）
 */
export default function AIStyleCalibration() {
  const [, setLocation] = useLocation();
  const projectId = useMemo(() => {
    const url = new URL(window.location.href);
    return url.searchParams.get('project') || '';
  }, []);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const utils = trpc.useUtils();

  const { data: sampleData, isLoading, refetch, isFetching } = trpc.project.generateStyleSamples.useQuery(
    { projectId },
    { enabled: !!projectId, refetchOnMount: true, refetchOnWindowFocus: false },
  );

  // ★はじめの設定が終わった直後の行き先。
  //   Threadsが未連携のままAI生成画面に置かれると、作っても投稿できず手詰まりになるため、
  //   未連携の方はまず連携画面へご案内する。
  const { data: threadsAccounts } = trpc.threads.list.useQuery();
  const nextPathAfterSetup = () =>
    (threadsAccounts?.length ?? 0) > 0 ? `/ai-generate?project=${projectId}` : '/threads-connect';

  const saveMutation = trpc.project.saveStylePreference.useMutation({
    onSuccess: () => {
      utils.project.getStylePreference.invalidate({ projectId });
      toast.success('スタイルの好みを保存しました');
      setLocation(nextPathAfterSetup());
    },
    onError: (e) => toast.error(e.message),
  });

  if (!projectId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-muted-foreground">プロジェクトが指定されていません。</p>
            <Button onClick={() => setLocation('/ai-generate')}>AI投稿生成へ戻る</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const samples = sampleData?.samples ?? [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 3) {
        toast.message('選択は最大3つまでです', { description: '一番好きな雰囲気だけに絞ってください' });
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleSubmit = () => {
    if (selectedIds.length === 0) {
      toast.error('好きな雰囲気を1つは選んでください');
      return;
    }
    saveMutation.mutate({ projectId, selectedStyleIds: selectedIds });
  };

  const handleSkip = () => {
    setLocation(nextPathAfterSetup());
  };

  return (
    <div className="container max-w-3xl py-6 px-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={handleSkip}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          戻る
        </Button>
        <Badge variant="secondary" className="gap-1">
          <Sparkles className="h-3 w-3" />
          スタイル校正
        </Badge>
      </div>

      {/* タイトル */}
      <div>
        <h1 className="text-xl font-bold">どの雰囲気が一番好きですか？</h1>
        <p className="text-sm text-muted-foreground mt-1">
          サンプルから 1〜3 個タップして選んでください。AI は以降この雰囲気に寄せて投稿を作ります。
          <br />
          後からプロジェクト設定で変えられます。
        </p>
      </div>

      {/* サンプル一覧 */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {samples.map((s) => {
            const isSelected = selectedIds.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSelect(s.id)}
                className={cn(
                  'text-left rounded-lg border p-4 transition-all',
                  'hover:bg-accent/30',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                    : 'border-border',
                )}
              >
                <div className="flex items-start gap-2 mb-2">
                  <div className={cn(
                    'h-4 w-4 mt-0.5 rounded border-2 flex-shrink-0 flex items-center justify-center',
                    isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                  )}>
                    {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{s.toneLabel}</div>
                    <div className="text-xs text-muted-foreground">{s.toneDescription}</div>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans bg-muted/40 rounded p-3 mt-2">
                  {s.template}
                </pre>
              </button>
            );
          })}
        </div>
      )}

      {/* アクション */}
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sticky bottom-2 z-40 bg-background/95 backdrop-blur-sm py-3 -mx-4 px-4 border-t rounded-t-lg">
        <Button
          variant="ghost"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn('h-4 w-4 mr-1', isFetching && 'animate-spin')} />
          別のサンプルを見る
        </Button>
        <div className="flex-1" />
        <Button variant="outline" onClick={handleSkip}>
          スキップ
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={selectedIds.length === 0 || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <PartyPopper className="h-4 w-4 mr-1" />
              この雰囲気で進める（{selectedIds.length}個選択）
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

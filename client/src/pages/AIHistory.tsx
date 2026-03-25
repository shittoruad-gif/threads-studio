import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, Copy, Calendar, RefreshCw } from 'lucide-react';
import ThreadsAccountSwitcher from '@/components/ThreadsAccountSwitcher';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const POST_TYPE_LABELS: Record<string, string> = {
  hook_tree: '🎣 「常識を覆す」型',
  expertise: '🎓 「実はこうだった」型',
  local: '📍 地元ネタ型',
  proof: '📊 実績・体験談型',
  empathy: '💙 「わかる」共感型',
  story: '📖 ストーリー型',
  list: '📋 「○選」リスト型',
  offer: '🎯 「今すぐ来て」型',
  enemy: '⚔️ 「実は間違い」型',
  qa: '❓ Q&A型',
  trend: '🔥 時事ネタ型',
  aruaru: '😅 あるある型',
};

export default function AIHistory() {
  const breadcrumbItems = [
    { label: 'AI投稿', href: '/dashboard' },
    { label: '生成履歴' },
  ];

  const [, setLocation] = useLocation();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<any | null>(null);

  const { data, isLoading, refetch } = trpc.project.getAiHistory.useQuery({ limit: 50, offset: 0 });
  const deleteMutation = trpc.project.deleteAiHistory.useMutation({
    onSuccess: () => {
      toast.success('履歴を削除しました');
      refetch();
      setDeleteId(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleRegenerate = (historyId: number) => {
    // Navigate to AI generation page with history ID
    setLocation(`/ai-generate?historyId=${historyId}`);
  };

  const handleCopy = (content: string) => {
    try {
      const parsed = JSON.parse(content);
      const text = `${parsed.title}\n\n${parsed.mainPost}\n\n${parsed.treePosts.join('\n\n')}\n\n${parsed.cta}\n\n${parsed.hashtags.join(' ')}`;
      navigator.clipboard.writeText(text);
      toast.success('コピーしました');
    } catch (error) {
      toast.error('コピーに失敗しました');
    }
  };

  const handleDelete = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate({ id: deleteId });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const history = data?.history || [];
  const total = data?.total || 0;

  return (
    <div className="container max-w-6xl py-8">
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">AI生成履歴</h1>
          <p className="text-muted-foreground">
            過去に生成した投稿を確認・再利用できます（全{total}件）
          </p>
        </div>
        <ThreadsAccountSwitcher />
      </div>

      {history.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            まだ履歴がありません。AI投稿生成を使用すると、ここに履歴が表示されます。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {history.map((item: any) => {
            const content = JSON.parse(item.content);
            const metadata = item.metadata ? JSON.parse(item.metadata) : {};
            
            return (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge variant="secondary">
                          {POST_TYPE_LABELS[item.postType] || item.postType}
                        </Badge>
                        {content.hookType && (
                          <Badge variant="outline" className="text-primary border-primary/30 text-xs">
                            🎯 {content.hookType}
                          </Badge>
                        )}
                        {content.cvGoal && (
                          <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                            CV: {content.cvGoal}
                          </Badge>
                        )}
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          {new Date(item.createdAt).toLocaleString('ja-JP')}
                        </div>
                      </div>
                      <CardTitle className="text-xl">{content.title}</CardTitle>
                      {metadata.businessType && (
                        <CardDescription className="mt-1">
                          {metadata.businessType} | {metadata.area}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleRegenerate(item.id)}
                      >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        再生成
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(item.content)}
                      >
                        <Copy className="w-4 h-4 mr-1" />
                        コピー
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedHistory(item)}
                      >
                        詳細
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium mb-1">メイン投稿</p>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {content.mainPost}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1">ツリー投稿（{content.treePosts.length}件）</p>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {content.treePosts[0]}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>履歴を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。本当に削除してもよろしいですか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail Dialog */}
      {selectedHistory && (
        <AlertDialog open={true} onOpenChange={() => setSelectedHistory(null)}>
          <AlertDialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>{JSON.parse(selectedHistory.content).title}</AlertDialogTitle>
              <AlertDialogDescription>
                {new Date(selectedHistory.createdAt).toLocaleString('ja-JP')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4">
              {(() => {
                const content = JSON.parse(selectedHistory.content);
                return (
                  <>
                    <div>
                      <p className="font-medium mb-2">メイン投稿</p>
                      <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">{content.mainPost}</p>
                    </div>
                    <div>
                      <p className="font-medium mb-2">ツリー投稿</p>
                      <div className="space-y-2">
                        {content.treePosts.map((post: string, index: number) => (
                          <div key={index} className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">
                            {index + 1}. {post}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="font-medium mb-2">CTA</p>
                      <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">{content.cta}</p>
                    </div>
                    <div>
                      <p className="font-medium mb-2">ハッシュタグ</p>
                      <p className="text-sm bg-muted p-3 rounded">{content.hashtags.join(' ')}</p>
                    </div>
                    {content.hookType && (
                      <div className="p-3 bg-primary/10 rounded-lg">
                        <span className="font-medium text-primary">🎯 最初の1行の引き方：</span>
                        <span className="text-sm">{content.hookType}</span>
                      </div>
                    )}
                    {content.cvGoal && (
                      <div className="p-3 bg-green-500/10 rounded-lg">
                        <span className="font-medium text-green-600">📊 この投稿の目的：</span>
                        <span className="text-sm">{content.cvGoal}</span>
                      </div>
                    )}
                    <div>
                      <p className="font-medium mb-2">投稿の狙い</p>
                      <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">{content.goal}</p>
                    </div>
                    <div>
                      <p className="font-medium mb-2">期待できる効果</p>
                      <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">{content.expectedEffect}</p>
                    </div>
                    {content.weeklyImprovementPoint && (
                      <div>
                        <p className="font-medium mb-2">今週の改善ヒント</p>
                        <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">{content.weeklyImprovementPoint}</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>閉じる</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleCopy(selectedHistory.content)}>
                全体をコピー
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

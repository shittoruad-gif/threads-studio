import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Trash2, Copy, Calendar, RefreshCw, Search, Heart, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PER_PAGE = 20;

  // Clone dialog state
  const [cloneHistoryId, setCloneHistoryId] = useState<number | null>(null);
  const [cloneCount, setCloneCount] = useState(5);
  const [cloneResults, setCloneResults] = useState<any[] | null>(null);
  const [cloneOriginalTitle, setCloneOriginalTitle] = useState('');

  const { data, isLoading, refetch } = trpc.project.getAiHistory.useQuery({ limit: 50, offset: 0 });
  const { data: favoritesData, refetch: refetchFavorites } = trpc.favorite.list.useQuery();
  const toggleFavoriteMutation = trpc.favorite.toggle.useMutation({
    onSuccess: (data) => {
      toast.success(data.favorited ? 'お気に入りに追加しました' : 'お気に入りを解除しました');
      refetchFavorites();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const favoriteHistoryIds = useMemo(() => {
    return new Set((favoritesData || []).map((f: any) => f.historyId));
  }, [favoritesData]);
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

  const cloneMutation = trpc.project.cloneHitPost.useMutation({
    onSuccess: (data) => {
      setCloneResults(data.variations);
      setCloneOriginalTitle(data.originalTitle);
      toast.success(`${data.variations.length}件のバリエーションを生成しました`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleRegenerate = (historyId: number) => {
    setLocation(`/ai-generate?historyId=${historyId}`);
  };

  const handleCopy = async (content: string) => {
    try {
      const parsed = JSON.parse(content);
      const text = `${parsed.title}\n\n${parsed.mainPost}\n\n${parsed.treePosts.join('\n\n')}\n\n${parsed.cta}\n\n${parsed.hashtags.join(' ')}`;
      await navigator.clipboard.writeText(text);
      toast.success('コピーしました');
    } catch (error) {
      toast.error('コピーに失敗しました。ブラウザの権限設定を確認してください。');
    }
  };

  const handleCopyVariation = async (variation: any) => {
    try {
      const text = `${variation.title}\n\n${variation.mainPost}\n\n${variation.treePosts.join('\n\n')}\n\n${variation.cta}\n\n${variation.hashtags.join(' ')}`;
      await navigator.clipboard.writeText(text);
      toast.success('コピーしました');
    } catch (error) {
      toast.error('コピーに失敗しました。ブラウザの権限設定を確認してください。');
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

  const handleCloneOpen = (historyId: number) => {
    setCloneHistoryId(historyId);
    setCloneCount(5);
    setCloneResults(null);
    setCloneOriginalTitle('');
  };

  const handleCloneGenerate = () => {
    if (cloneHistoryId) {
      cloneMutation.mutate({ historyId: cloneHistoryId, count: cloneCount });
    }
  };

  const handleCloneClose = () => {
    setCloneHistoryId(null);
    setCloneResults(null);
    setCloneOriginalTitle('');
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

  const filteredHistory = useMemo(() => {
    let filtered = history;

    if (showFavoritesOnly) {
      filtered = filtered.filter((item: any) => favoriteHistoryIds.has(item.id));
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((item: any) => {
        try {
          const content = JSON.parse(item.content);
          const metadata = item.metadata ? JSON.parse(item.metadata) : {};
          const searchableText = [
            content.title,
            content.mainPost,
            ...(content.treePosts || []),
            content.cta,
            metadata.businessType,
            metadata.area,
            item.postType,
          ].filter(Boolean).join(' ').toLowerCase();
          return searchableText.includes(query);
        } catch {
          return false;
        }
      });
    }

    return filtered;
  }, [history, searchQuery, showFavoritesOnly, favoriteHistoryIds]);

  // Pagination
  const totalHistoryPages = Math.ceil(filteredHistory.length / HISTORY_PER_PAGE);
  const safeHistoryPage = Math.min(historyPage, Math.max(1, totalHistoryPages));
  const paginatedHistory = filteredHistory.slice(
    (safeHistoryPage - 1) * HISTORY_PER_PAGE,
    safeHistoryPage * HISTORY_PER_PAGE
  );

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

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="履歴を検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant={showFavoritesOnly ? "default" : "outline"}
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          size="default"
        >
          <Heart className={`h-4 w-4 mr-2 ${showFavoritesOnly ? 'fill-current' : ''}`} />
          お気に入りのみ
        </Button>
      </div>

      {/* Search Results Count */}
      {(searchQuery.trim() || showFavoritesOnly) && (
        <p className="text-sm text-muted-foreground mb-4">
          検索結果: {filteredHistory.length}件
        </p>
      )}

      {history.length === 0 ? (
        <div className="text-center py-12">
          <Sparkles className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground mb-2">AIの生成履歴はまだありません</p>
          <p className="text-sm text-muted-foreground mb-4">AI投稿生成を使用すると、ここに履歴が表示されます。</p>
          <Button variant="outline" onClick={() => setLocation('/ai-generate')}>
            <Sparkles className="w-4 h-4 mr-2" />
            AI投稿を生成する
          </Button>
        </div>
      ) : filteredHistory.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            該当する履歴がありません
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="grid gap-4">
          {paginatedHistory.map((item: any) => {
            const content = JSON.parse(item.content);
            const metadata = item.metadata ? JSON.parse(item.metadata) : {};
            const isFavorited = favoriteHistoryIds.has(item.id);

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
                    <div className="flex gap-2 flex-wrap justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleFavoriteMutation.mutate({ historyId: item.id })}
                        title={isFavorited ? 'お気に入り解除' : 'お気に入りに追加'}
                        aria-label={isFavorited ? 'お気に入り解除' : 'お気に入りに追加'}
                      >
                        <Heart className={`w-4 h-4 ${isFavorited ? 'fill-red-500 text-red-500' : ''}`} />
                      </Button>
                      <Button
                        size="sm"
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                        onClick={() => handleCloneOpen(item.id)}
                        title="当たり投稿を量産"
                      >
                        <Sparkles className="w-4 h-4 mr-1" />
                        量産する
                      </Button>
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
                        aria-label="削除"
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

        {/* Pagination */}
        {totalHistoryPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              {filteredHistory.length}件中 {(safeHistoryPage - 1) * HISTORY_PER_PAGE + 1}〜{Math.min(safeHistoryPage * HISTORY_PER_PAGE, filteredHistory.length)}件を表示
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label="前のページ"
                onClick={() => setHistoryPage(Math.max(1, safeHistoryPage - 1))}
                disabled={safeHistoryPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                {safeHistoryPage} / {totalHistoryPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label="次のページ"
                onClick={() => setHistoryPage(Math.min(totalHistoryPages, safeHistoryPage + 1))}
                disabled={safeHistoryPage === totalHistoryPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </>
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

      {/* Clone Hit Post Dialog */}
      <Dialog open={cloneHistoryId !== null} onOpenChange={(open) => { if (!open) handleCloneClose(); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <Sparkles className="w-5 h-5" />
              当たり投稿を量産
            </DialogTitle>
            <DialogDescription>
              高エンゲージメントの投稿をベースに、構成・トーンを維持したバリエーションを自動生成します。
            </DialogDescription>
          </DialogHeader>

          {!cloneResults ? (
            <div className="space-y-6 py-4">
              <div>
                <label className="text-sm font-medium mb-3 block">
                  生成する本数: <span className="text-orange-600 font-bold text-lg">{cloneCount}本</span>
                </label>
                <Slider
                  value={[cloneCount]}
                  onValueChange={(val) => setCloneCount(val[0])}
                  min={1}
                  max={10}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>1本</span>
                  <span>10本</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloneClose}>
                  キャンセル
                </Button>
                <Button
                  onClick={handleCloneGenerate}
                  disabled={cloneMutation.isPending}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {cloneMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      {cloneCount}本を生成する
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                「{cloneOriginalTitle}」のバリエーション（{cloneResults.length}件）
              </p>
              <div className="grid gap-4">
                {cloneResults.map((variation: any, index: number) => (
                  <Card key={index} className="border-orange-200 bg-orange-50/30">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">
                          #{index + 1} {variation.title}
                        </CardTitle>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopyVariation(variation)}
                          className="shrink-0"
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          コピー
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">メイン投稿</p>
                          <p className="text-sm whitespace-pre-wrap bg-white p-2 rounded border">
                            {variation.mainPost}
                          </p>
                        </div>
                        {variation.treePosts.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              ツリー投稿（{variation.treePosts.length}件）
                            </p>
                            <div className="space-y-1">
                              {variation.treePosts.map((post: string, i: number) => (
                                <p key={i} className="text-sm whitespace-pre-wrap bg-white p-2 rounded border">
                                  {i + 1}. {post}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <p className="text-xs bg-white px-2 py-1 rounded border">
                            CTA: {variation.cta}
                          </p>
                          <p className="text-xs bg-white px-2 py-1 rounded border">
                            {variation.hashtags.join(' ')}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloneClose}>
                  閉じる
                </Button>
                <Button
                  onClick={() => {
                    setCloneResults(null);
                    setCloneCount(5);
                  }}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  追加で生成する
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
              <Button
                onClick={() => handleCloneOpen(selectedHistory.id)}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                量産する
              </Button>
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

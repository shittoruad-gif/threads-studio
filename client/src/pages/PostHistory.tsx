import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Calendar, CheckCircle2, CheckSquare, Clock, XCircle, Loader2, ChevronLeft, ChevronRight, Filter, RotateCcw, Square, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 20;

type StatusFilter = "all" | "pending" | "posted" | "failed" | "canceled";

export default function PostHistory() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCanceling, setBulkCanceling] = useState(false);
  // ID of the post pending delete confirmation. null = no dialog shown.
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  const { data: scheduledPosts, isLoading, refetch } = trpc.scheduledPost.list.useQuery();
  const cancelPost = trpc.scheduledPost.cancel.useMutation({
    onSuccess: () => {
      toast.success('予約投稿をキャンセルしました');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const retryPost = trpc.scheduledPost.retry.useMutation({
    onSuccess: () => {
      toast.success('5分後に再投稿を試みます');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const removePost = trpc.scheduledPost.remove.useMutation({
    onSuccess: () => {
      toast.success('履歴から削除しました');
      refetch();
      setDeleteTargetId(null);
    },
    onError: (error) => {
      toast.error(error.message);
      setDeleteTargetId(null);
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
          <Clock className="w-3 h-3 mr-1" />
          予約中
        </Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-600 border-yellow-200">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          処理中
        </Badge>;
      case 'posted':
        return <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          投稿済み
        </Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
          <XCircle className="w-3 h-3 mr-1" />
          失敗
        </Badge>;
      case 'canceled':
        return <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-border">
          <XCircle className="w-3 h-3 mr-1" />
          キャンセル
        </Badge>;
      default:
        return null;
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Filter posts
  const filteredPosts = (scheduledPosts || []).filter((post) => {
    if (statusFilter === "all") return true;
    return post.status === statusFilter;
  });

  // Pagination
  const totalPages = Math.ceil(filteredPosts.length / ITEMS_PER_PAGE);
  const paginatedPosts = filteredPosts.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  // Reset page when filter changes
  const handleFilterChange = (filter: StatusFilter) => {
    setStatusFilter(filter);
    setPage(1);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pendingOnPage = paginatedPosts.filter((p) => p.status === "pending");
  const allPendingSelected = pendingOnPage.length > 0 && pendingOnPage.every((p) => selectedIds.has(p.id));

  const toggleSelectAllPending = () => {
    if (allPendingSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pendingOnPage.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pendingOnPage.forEach((p) => next.add(p.id));
        return next;
      });
    }
  };

  const handleBulkCancel = async () => {
    if (selectedIds.size === 0) return;
    setBulkCanceling(true);
    try {
      const promises = Array.from(selectedIds).map((id) =>
        cancelPost.mutateAsync({ postId: id })
      );
      await Promise.all(promises);
      toast.success(`${selectedIds.size}件の予約投稿をキャンセルしました`);
      setSelectedIds(new Set());
      refetch();
    } catch {
      toast.error("一部のキャンセルに失敗しました");
      refetch();
    } finally {
      setBulkCanceling(false);
    }
  };

  const statusFilters: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "すべて", count: scheduledPosts?.length || 0 },
    { value: "pending", label: "予約中", count: scheduledPosts?.filter((p) => p.status === "pending").length || 0 },
    { value: "posted", label: "投稿済み", count: scheduledPosts?.filter((p) => p.status === "posted").length || 0 },
    { value: "failed", label: "失敗", count: scheduledPosts?.filter((p) => p.status === "failed").length || 0 },
    { value: "canceled", label: "キャンセル", count: scheduledPosts?.filter((p) => p.status === "canceled").length || 0 },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-primary/20 rounded-full blur-3xl float" style={{animationDelay: '0s'}} />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/30 rounded-full blur-3xl float" style={{animationDelay: '2s'}} />
      </div>

      <div className="container py-8 relative z-10">
        <div className="flex items-center justify-between mb-6 scale-in">
          <Button variant="ghost" className="glass hover-lift" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            ダッシュボードに戻る
          </Button>
        </div>

        <Card className="glass-card mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 gradient-text">
              <Calendar className="w-6 h-6" />
              投稿履歴・予約一覧
            </CardTitle>

            {/* Status Filter */}
            {scheduledPosts && scheduledPosts.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {statusFilters.map((filter) => (
                  filter.count > 0 || filter.value === "all" ? (
                    <button
                      key={filter.value}
                      onClick={() => handleFilterChange(filter.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        statusFilter === filter.value
                          ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                          : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                      }`}
                    >
                      {filter.label}
                      <span className="ml-1 opacity-70">({filter.count})</span>
                    </button>
                  ) : null
                ))}
              </div>
            )}
          </CardHeader>
          {/* Bulk action bar */}
          {pendingOnPage.length > 0 && (
            <div className="px-6 pb-2">
              <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                <button
                  onClick={toggleSelectAllPending}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {allPendingSelected ? (
                    <CheckSquare className="w-4 h-4 text-primary" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  予約中をすべて選択
                </button>
                {selectedIds.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={handleBulkCancel}
                    disabled={bulkCanceling}
                  >
                    {bulkCanceling ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <XCircle className="w-3 h-3 mr-1" />
                    )}
                    {selectedIds.size}件を一括キャンセル
                  </Button>
                )}
              </div>
            </div>
          )}

          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : paginatedPosts.length > 0 ? (
              <>
                <div className="space-y-4">
                  {paginatedPosts.map((post) => (
                    <Card key={post.id} className="glass hover-lift">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          {post.status === 'pending' && (
                            <button
                              onClick={() => toggleSelect(post.id)}
                              aria-label={selectedIds.has(post.id) ? "選択を解除" : "選択する"}
                              className="mt-1 flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                            >
                              {selectedIds.has(post.id) ? (
                                <CheckSquare className="w-5 h-5 text-primary" />
                              ) : (
                                <Square className="w-5 h-5" />
                              )}
                            </button>
                          )}
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {getStatusBadge(post.status)}
                              <span className="text-sm text-muted-foreground">
                                {formatDate(post.scheduledAt)}
                              </span>
                            </div>

                            <p className="text-sm line-clamp-3 text-foreground">
                              {post.postContent}
                            </p>

                            {post.postedAt && (
                              <p className="text-xs text-green-600">
                                投稿完了: {formatDate(post.postedAt)}
                              </p>
                            )}

                            {post.errorMessage && (
                              <p className="text-xs text-red-600 break-words">
                                エラー: {post.errorMessage}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col gap-1">
                          {post.status === 'pending' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="glass hover-lift"
                              onClick={() => cancelPost.mutate({ postId: post.id })}
                              disabled={cancelPost.isPending}
                            >
                              キャンセル
                            </Button>
                          )}
                          {post.status === 'failed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-amber-600 border-amber-200 hover:bg-amber-50"
                              onClick={() => retryPost.mutate({ postId: post.id })}
                              disabled={retryPost.isPending}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              再試行
                            </Button>
                          )}
                          {/* Delete: available for any status. For pending posts
                              this prevents the cron from posting them. For
                              failed/canceled posts it cleans up history. */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setDeleteTargetId(post.id)}
                            title="履歴から削除"
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            削除
                          </Button>
                        </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                      {filteredPosts.length}件中 {(page - 1) * ITEMS_PER_PAGE + 1}〜{Math.min(page * ITEMS_PER_PAGE, filteredPosts.length)}件を表示
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label="前のページ"
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground px-2">
                        {page} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label="次のページ"
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-2">
                  {statusFilter !== "all" ? `「${statusFilters.find(f => f.value === statusFilter)?.label}」の投稿はありません` : "予約投稿はありません"}
                </p>
                {statusFilter !== "all" ? (
                  <Button
                    variant="outline"
                    className="glass hover-lift"
                    onClick={() => handleFilterChange("all")}
                  >
                    すべて表示
                  </Button>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground/80 mb-4">
                      AI投稿生成から投稿を作って、予約投稿として登録できます
                    </p>
                    <div className="flex gap-2 justify-center flex-wrap">
                      <Button
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => setLocation("/ai-generate")}
                      >
                        AIで投稿を作成
                      </Button>
                      <Button
                        variant="outline"
                        className="glass hover-lift"
                        onClick={() => setLocation("/dashboard")}
                      >
                        ダッシュボードへ
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete confirmation. We confirm regardless of status because for
          a pending post deletion stops the cron from posting it. */}
      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>履歴から削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const target = scheduledPosts?.find(p => p.id === deleteTargetId);
                if (!target) return null;
                if (target.status === 'pending') {
                  return '予約投稿が削除され、自動投稿は行われなくなります。この操作は取り消せません。';
                }
                if (target.status === 'failed') {
                  return '失敗した投稿の履歴を削除します。この操作は取り消せません。';
                }
                return 'この投稿の履歴を削除します。この操作は取り消せません。';
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTargetId !== null) {
                  removePost.mutate({ postId: deleteTargetId });
                }
              }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

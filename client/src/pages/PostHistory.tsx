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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Calendar, CheckCircle2, CheckSquare, Clock, XCircle, Loader2, ChevronLeft, ChevronRight, Filter, RotateCcw, Square, Trash2, AlertTriangle, Link2, Search, Download, Pencil } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { translatePostError } from "@/lib/postErrors";
import { useThreadsAccount } from "@/components/ThreadsAccountSwitcher";
import PageGuide from "@/components/PageGuide";
import { useLang } from "@/i18n";
import { getAngle } from "@shared/postAngles";

const ITEMS_PER_PAGE = 20;

type StatusFilter = "all" | "awaiting_approval" | "pending" | "posted" | "failed" | "canceled";

export default function PostHistory() {
  const { t } = useLang();
  const [, setLocation] = useLocation();
  // ヘッダーの切替UIで選択中の連携アカウント（一覧をこのアカウントに絞る）
  const { selectedAccountId } = useThreadsAccount();
  const [page, setPage] = useState(1);
  // URL の ?status=pending 等で初期フィルタを受ける（ダッシュボードの「予約投稿を管理」から予約中を直接開く）
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    try {
      const s = new URLSearchParams(window.location.search).get('status');
      if (s === 'awaiting_approval' || s === 'pending' || s === 'posted' || s === 'failed' || s === 'canceled') return s;
    } catch { /* ignore */ }
    return "all";
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCanceling, setBulkCanceling] = useState(false);
  // ID of the post pending delete confirmation. null = no dialog shown.
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  // 承認待ち投稿の編集用（id と編集中の本文）
  const [editTarget, setEditTarget] = useState<{ id: number; content: string; projectId?: string } | null>(null);
  const editProjectId = editTarget?.projectId;

  const { data: scheduledPosts, isLoading, refetch } = trpc.scheduledPost.list.useQuery({ accountId: selectedAccountId });
  const cancelPost = trpc.scheduledPost.cancel.useMutation({
    onSuccess: () => {
      toast.success(t('予約投稿をキャンセルしました'));
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
      toast.success(t('履歴から削除しました'));
      refetch();
      setDeleteTargetId(null);
    },
    onError: (error) => {
      toast.error(error.message);
      setDeleteTargetId(null);
    },
  });
  const approvePost = trpc.scheduledPost.approve.useMutation({
    onSuccess: () => {
      toast.success('承認しました。まもなく投稿されます');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  // ◯✕フィードバック（切り口の好み学習）。承認・キャンセルとは独立
  const ratePost = trpc.scheduledPost.rate.useMutation({
    onSuccess: (_data, vars) => {
      if (vars.rating === 'good') toast.success('「いい」と記録しました。この方向性が増えます');
      else if (vars.rating === 'bad') toast.success(t('「違う」と記録しました。この方向性は減らします'));
      else toast.success('評価を取り消しました');
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const editPost = trpc.scheduledPost.editContent.useMutation({
    onSuccess: () => {
      toast.success('内容を更新しました');
      setEditTarget(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'awaiting_approval':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
          <Clock className="w-3 h-3 mr-1" />
          {t('承認待ち')}
        </Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
          <Clock className="w-3 h-3 mr-1" />
          {t('予約中')}
        </Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-600 border-yellow-200">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          処理中
        </Badge>;
      case 'posted':
        return <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          {t('投稿済み')}
        </Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
          <XCircle className="w-3 h-3 mr-1" />
          {t('失敗')}
        </Badge>;
      case 'canceled':
        return <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-border">
          <XCircle className="w-3 h-3 mr-1" />
          {t('キャンセル')}
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

  // キーワード検索（本文の部分一致。過去投稿の再利用・重複チェックに使う）
  const [searchQuery, setSearchQuery] = useState("");

  // Filter posts
  const filteredPosts = (scheduledPosts || []).filter((post) => {
    if (statusFilter !== "all" && post.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      return (post.postContent || "").toLowerCase().includes(searchQuery.trim().toLowerCase());
    }
    return true;
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

  // CSVエクスポート（Excel向けBOM付き。PostAnalyticsと同型）
  const handleExportCSV = () => {
    if (filteredPosts.length === 0) {
      toast.error("エクスポートするデータがありません");
      return;
    }
    const esc = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const statusLabel: Record<string, string> = {
      awaiting_approval: "承認待ち", pending: "予約中", posted: "投稿済み", failed: "失敗", canceled: "キャンセル",
    };
    const header = "状態,本文,予約日時,投稿日時,エラー\n";
    const rows = filteredPosts
      .map((p) => [
        esc(statusLabel[p.status] ?? p.status),
        esc(p.postContent),
        esc(p.scheduledAt ? new Date(p.scheduledAt).toLocaleString("ja-JP") : ""),
        esc(p.postedAt ? new Date(p.postedAt).toLocaleString("ja-JP") : ""),
        esc(p.errorMessage ? translatePostError(p.errorMessage).title : ""),
      ].join(","))
      .join("\n");
    const csv = "﻿" + header + rows; // BOM for Excel
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `threads_posts_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filteredPosts.length}件をエクスポートしました`);
  };

  const statusFilters: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "すべて", count: scheduledPosts?.length || 0 },
    { value: "awaiting_approval", label: "承認待ち", count: scheduledPosts?.filter((p) => p.status === "awaiting_approval").length || 0 },
    { value: "pending", label: "予約中", count: scheduledPosts?.filter((p) => p.status === "pending").length || 0 },
    { value: "posted", label: "投稿済み", count: scheduledPosts?.filter((p) => p.status === "posted").length || 0 },
    { value: "failed", label: "失敗", count: scheduledPosts?.filter((p) => p.status === "failed").length || 0 },
    { value: "canceled", label: "キャンセル", count: scheduledPosts?.filter((p) => p.status === "canceled").length || 0 },
  ];

  return (
    <div className="relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-primary/20 rounded-full blur-3xl float" style={{animationDelay: '0s'}} />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/30 rounded-full blur-3xl float" style={{animationDelay: '2s'}} />
      </div>

      <div className="container py-8 relative z-10">
        <div className="flex items-center justify-between mb-6 scale-in">
          <Button variant="ghost" className="glass hover-lift" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('ダッシュボードに戻る')}
          </Button>
        </div>

        <PageGuide steps={[
          <>{t('上の')}<b>{t('承認待ち')}</b>{t('をタップして、公開前の投稿を確認します')}</>,
          <>{t('内容がよければ緑の')}<b>{t('承認して投稿')}</b>{t('を押します（これで公開されます）')}</>,
          <>{t('直したいときは')}<b>{t('編集')}</b>{' → '}<b>{t('保存')}</b>{' → '}<b>{t('承認して投稿')}</b>{t('。やめたいときは')}<b>{t('キャンセル')}</b></>,
          <>{t('投稿の下の')}<b>{t('◯ いい / ✕ 違う')}</b>{t('を押すと、AIが好みを学んで方向性を調整します')}</>,
        ]} />

        <Card className="glass-card mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 gradient-text">
              <Calendar className="w-6 h-6" />
              {t('投稿履歴・予約一覧')}
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
                      {t(filter.label)}
                      <span className="ml-1 opacity-70">({filter.count})</span>
                    </button>
                  ) : null
                ))}
              </div>
            )}

            {/* キーワード検索＋CSVエクスポート */}
            {scheduledPosts && scheduledPosts.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2 mt-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="本文をキーワード検索..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                    className="pl-9 h-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {searchQuery.trim() && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {filteredPosts.length}件ヒット
                    </span>
                  )}
                  <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-9">
                    <Download className="w-4 h-4 mr-1.5" />
                    {t('CSVエクスポート')}
                  </Button>
                </div>
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
                  {t('予約中をすべて選択')}
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
                        {/* スマホでは横並びにするとボタン列に幅を取られ、
                            本文が1px幅まで潰れて読めなくなっていた。
                            狭い画面では縦積み（本文→ボタン）にする。 */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-3 sm:gap-4">
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
                              <Badge
                                variant="outline"
                                className={(post as any).source === 'auto'
                                  ? 'bg-violet-50 text-violet-600 border-violet-200'
                                  : 'bg-muted/40 text-muted-foreground border-border'}
                              >
                                {(post as any).source === 'auto' ? t('自動') : t('手動')}
                              </Badge>
                              {(post as any).angle && getAngle((post as any).angle) && (
                                <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">
                                  {t(getAngle((post as any).angle)!.label)}
                                </Badge>
                              )}
                              <span className="text-sm text-muted-foreground">
                                {formatDate(post.scheduledAt)}
                              </span>
                            </div>

                            <p className="text-sm line-clamp-3 text-foreground">
                              {post.postContent}
                            </p>

                            {post.postedAt && (
                              <p className="text-xs text-green-600">
                                {t('投稿完了:')} {formatDate(post.postedAt)}
                              </p>
                            )}

                            {post.errorMessage && post.status === 'failed' && (() => {
                              const t = translatePostError(post.errorMessage);
                              const isErr = t.severity === 'error';
                              return (
                                <div className={`mt-1 rounded-md border p-2 text-xs ${isErr ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                                  <div className={`flex items-start gap-1.5 font-semibold ${isErr ? 'text-red-700' : 'text-amber-700'}`}>
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    <span>{t.title}</span>
                                  </div>
                                  {t.detail && (
                                    <p className={`mt-1 ${isErr ? 'text-red-600' : 'text-amber-600'}`}>{t.detail}</p>
                                  )}
                                </div>
                              );
                            })()}
                            {post.errorMessage && post.status !== 'failed' && (
                              <p className="text-xs text-amber-600 break-words">{translatePostError(post.errorMessage).title}</p>
                            )}

                            {/* ◯✕フィードバック：自動投稿の「切り口」の好みをAIに教える。
                                ラベルとボタンを同じ行にすると375pxで「✕違う」だけ次行に
                                落ちて不揃いになるため、ラベルは独立行にしている */}
                            {(post as any).source === 'auto' && post.status !== 'canceled' && (
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <span className="w-full text-xs text-muted-foreground sm:w-auto">{t('この方向性は：')}</span>
                                <button
                                  onClick={() => ratePost.mutate({ postId: post.id, rating: (post as any).clientRating === 'good' ? null : 'good' })}
                                  disabled={ratePost.isPending}
                                  className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                                    (post as any).clientRating === 'good'
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : 'border-border text-muted-foreground hover:border-emerald-400 hover:text-emerald-700'
                                  }`}
                                >
                                  {t('◯ いい')}
                                </button>
                                <button
                                  onClick={() => ratePost.mutate({ postId: post.id, rating: (post as any).clientRating === 'bad' ? null : 'bad' })}
                                  disabled={ratePost.isPending}
                                  className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                                    (post as any).clientRating === 'bad'
                                      ? 'bg-red-500 text-white border-red-500'
                                      : 'border-border text-muted-foreground hover:border-red-400 hover:text-red-600'
                                  }`}
                                >
                                  {t('✕ 違う')}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* スマホは2列グリッド（1列だと「内容を修正」が1文字ずつ縦に潰れる）。
                              PCは従来どおり縦1列。 */}
                          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-col sm:gap-1 [&_button]:whitespace-nowrap [&>button]:w-full sm:[&>button]:w-auto">
                          {post.status === 'awaiting_approval' && (
                            <>
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => approvePost.mutate({ postId: post.id })}
                                disabled={approvePost.isPending}
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                承認して投稿
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="glass hover-lift"
                                onClick={() => setEditTarget({ id: post.id, content: post.postContent || '', projectId: (post as any).projectId })}
                              >
                                編集
                              </Button>
                            </>
                          )}
                          {post.status === 'pending' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="glass hover-lift"
                                onClick={() => setEditTarget({ id: post.id, content: post.postContent || '', projectId: (post as any).projectId })}
                              >
                                <Pencil className="w-3 h-3 mr-1" />
                                {t('内容を修正')}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="glass hover-lift"
                                onClick={() => cancelPost.mutate({ postId: post.id })}
                                disabled={cancelPost.isPending}
                              >
                                {t('キャンセル')}
                              </Button>
                            </>
                          )}
                          {post.status === 'failed' && (() => {
                            const t = translatePostError(post.errorMessage);
                            if (t.action === 'reauth') {
                              return (
                                <Button
                                  size="sm"
                                  className="bg-red-600 hover:bg-red-700 text-white"
                                  onClick={() => setLocation('/threads-connect')}
                                >
                                  <Link2 className="w-3 h-3 mr-1" />
                                  Threads連携を確認
                                </Button>
                              );
                            }
                            if (t.action === 'none') return null;
                            return (
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
                            );
                          })()}
                          {/* Delete: available for any status. For pending posts
                              this prevents the cron from posting them. For
                              failed/canceled posts it cleans up history. */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setDeleteTargetId(post.id)}
                            title={t("履歴から削除")}
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            {t('削除')}
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
                      {`${(page - 1) * ITEMS_PER_PAGE + 1}-${Math.min(page * ITEMS_PER_PAGE, filteredPosts.length)} / ${filteredPosts.length}`}
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
                      {/* whitespace-nowrap必須：無いと「1 / 8」が1文字ずつ縦積みになる */}
                      <span className="text-sm text-muted-foreground px-2 whitespace-nowrap">
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
            <AlertDialogTitle>{t('履歴から削除しますか？')}</AlertDialogTitle>
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

      {/* 承認待ち投稿の内容編集ダイアログ */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="bg-background border border-border">
          <DialogHeader>
            <DialogTitle>投稿内容を編集</DialogTitle>
            <DialogDescription>
              投稿される前に、この投稿の内容を直接修正できます。
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={editTarget?.content ?? ''}
            onChange={(e) => setEditTarget((prev) => prev && { ...prev, content: e.target.value })}
            rows={8}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm whitespace-pre-wrap"
          />
          <p className="text-xs text-muted-foreground text-right">
            {Array.from(editTarget?.content ?? '').length} 文字
          </p>
          {/* 根本修正への誘導：毎回同じ間違いなら登録情報を直す */}
          <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            💡 毎回同じ間違い（店名・地域・実績など）が出る場合は、この1件を直すだけでなく
            <button
              type="button"
              className="text-emerald-700 font-medium underline mx-1"
              onClick={() => setLocation(editProjectId ? `/ai-counseling?project=${editProjectId}` : '/ai-generate')}
            >
              登録情報（カウンセリング）を修正
            </button>
            すると、次回の自動投稿から反映されます。
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>キャンセル</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={editPost.isPending || !editTarget?.content?.trim()}
              onClick={() => {
                if (editTarget) editPost.mutate({ postId: editTarget.id, postContent: editTarget.content });
              }}
            >
              {editPost.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

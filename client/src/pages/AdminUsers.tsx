import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Key, AlertTriangle, Mail, RefreshCw, Search, Download } from 'lucide-react';
import { toast } from 'sonner';

// プラン表示名
const PLAN_LABELS: Record<string, string> = {
  free: '無料', light: 'ライト', standard: 'スタンダード', pro: 'プロ', premium: 'プレミアム',
};
const planLabel = (planId: string | null) => (planId ? (PLAN_LABELS[planId] || planId) : '無料');

// サブスク状態バッジ
function statusBadge(status: string | null, trialEndsAt: string | Date | null) {
  if (!status) return { label: '未契約', cls: 'bg-muted text-muted-foreground' };
  if (status === 'trialing') {
    let days = '';
    if (trialEndsAt) {
      const d = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000);
      days = d > 0 ? `（残${d}日）` : '（期限切れ）';
    }
    return { label: `トライアル中${days}`, cls: 'bg-blue-100 text-blue-800' };
  }
  if (status === 'active') return { label: '有効', cls: 'bg-emerald-100 text-emerald-800' };
  if (status === 'past_due') return { label: '決済失敗', cls: 'bg-amber-100 text-amber-800' };
  if (status === 'unpaid') return { label: '停止中', cls: 'bg-red-100 text-red-800' };
  if (status === 'incomplete') return { label: '初回未完了', cls: 'bg-yellow-100 text-yellow-800' };
  if (status === 'canceled') return { label: '解約済み', cls: 'bg-muted text-muted-foreground' };
  return { label: status, cls: 'bg-muted text-foreground' };
}

const relativeDays = (d: string | Date | null) => {
  if (!d) return '-';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return '今日';
  if (days === 1) return '昨日';
  if (days < 30) return `${days}日前`;
  return `${Math.floor(days / 30)}ヶ月前`;
};

export default function AdminUsers() {
  const breadcrumbItems = [
    { label: '管理者', href: '/dashboard' },
    { label: 'ユーザー管理' },
  ];

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const { data: users, isLoading, refetch } = trpc.admin.getAllUsers.useQuery();
  const setMonitorMutation = trpc.admin.setUserMonitor.useMutation({
    onSuccess: () => { toast.success('モニター設定を更新しました'); refetch(); },
    onError: (e) => toast.error(e.message ?? '更新に失敗しました'),
  });

  // 検索（名前・店舗名・メール・ID）
  const q = search.trim().toLowerCase();
  const filteredUsers = (users ?? []).filter((u) =>
    !q ||
    (u.name ?? '').toLowerCase().includes(q) ||
    ((u as any).storeName ?? '').toLowerCase().includes(q) ||
    (u.email ?? '').toLowerCase().includes(q) ||
    String(u.id).includes(q)
  );

  // CSVエクスポート（セミナー案内の宛先リスト作成用。Excel向けBOM付き）
  const handleExportCSV = () => {
    if (filteredUsers.length === 0) { toast.error('エクスポートするデータがありません'); return; }
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = '名前,店舗名,メールアドレス,プラン,状態,モニター,規約同意日,規約版,登録日\n';
    const rows = filteredUsers.map((u) => {
      const a = u as any;
      return [
        esc(u.name), esc(a.storeName), esc(u.email), esc(a.planId ?? ''),
        esc(a.subscriptionStatus ?? ''), esc(a.isMonitor ? 'はい' : ''),
        esc(u.termsAgreedAt ? new Date(u.termsAgreedAt).toLocaleString('ja-JP') : ''),
        esc(u.termsVersion ?? ''),
        esc(u.createdAt ? new Date(u.createdAt).toLocaleDateString('ja-JP') : ''),
      ].join(',');
    }).join('\n');
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `users_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${filteredUsers.length}件をエクスポートしました`);
  };

  // サマリー集計
  const summary = {
    total: users?.length ?? 0,
    paid: (users ?? []).filter((u) => (u as any).planId && (u as any).planId !== 'free' && (u as any).subscriptionStatus === 'active').length,
    trialing: (users ?? []).filter((u) => (u as any).subscriptionStatus === 'trialing').length,
    monitors: (users ?? []).filter((u) => (u as any).isMonitor).length,
    issues: (users ?? []).filter((u) => ['past_due', 'unpaid', 'incomplete'].includes((u as any).subscriptionStatus)).length,
  };
  const resetPasswordMutation = trpc.admin.resetUserPassword.useMutation({
    onSuccess: () => {
      toast.success('パスワードをリセットしました');
      setResetDialogOpen(false);
      setNewPassword('');
      setSelectedUserId(null);
      refetch();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleResetPassword = () => {
    if (!selectedUserId) return;
    setError('');
    resetPasswordMutation.mutate({ userId: selectedUserId, newPassword });
  };

  const openResetDialog = (userId: number) => {
    setSelectedUserId(userId);
    setNewPassword('');
    setError('');
    setResetDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <PageBreadcrumb items={breadcrumbItems} />

      {/* 決済失敗ユーザー一覧（最重要なので先頭） */}
      <PaymentIssuesPanel />

      {/* サマリー */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: '総ユーザー', value: summary.total, cls: 'text-foreground' },
          { label: '有料（有効）', value: summary.paid, cls: 'text-emerald-600' },
          { label: 'トライアル中', value: summary.trialing, cls: 'text-blue-600' },
          { label: 'モニター', value: summary.monitors, cls: 'text-amber-600' },
          { label: '決済問題', value: summary.issues, cls: 'text-red-600' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="py-4 text-center">
              <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ユーザー管理</CardTitle>
          <CardDescription>
            登録ユーザーの状況（プラン・状態・モニター・連携・最終ログイン）
          </CardDescription>
          <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="名前・店舗名・メール・IDで検索"
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="shrink-0">
              <Download className="w-4 h-4 mr-1.5" />
              CSVエクスポート（{filteredUsers.length}件）
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>名前</TableHead>
                <TableHead>店舗名</TableHead>
                <TableHead>メールアドレス</TableHead>
                <TableHead>プラン</TableHead>
                <TableHead>状態</TableHead>
                <TableHead>連携</TableHead>
                <TableHead>モニター</TableHead>
                <TableHead>規約同意</TableHead>
                <TableHead>最終ログイン</TableHead>
                <TableHead>登録日</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => {
                const u = user as any;
                const sb = statusBadge(u.subscriptionStatus, u.trialEndsAt);
                return (
                <TableRow key={user.id}>
                  <TableCell>{user.id}</TableCell>
                  <TableCell className="max-w-[160px] truncate">
                    {user.name || '-'}
                    {user.role === 'admin' && (
                      <span className="ml-1 px-1.5 py-0.5 text-[12px] font-semibold rounded bg-indigo-100 text-indigo-800">管理者</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate">{(user as any).storeName || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs">{user.email || '-'}</TableCell>
                  <TableCell>{planLabel(u.planId)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${sb.cls}`}>{sb.label}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    {u.threadsAccountCount > 0
                      ? <span className="font-medium">{u.threadsAccountCount}</span>
                      : <span className="text-muted-foreground/50">0</span>}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant={u.isMonitor ? 'default' : 'outline'}
                      size="sm"
                      className={u.isMonitor ? 'bg-amber-500 hover:bg-amber-600 text-white h-7 text-xs' : 'h-7 text-xs'}
                      disabled={setMonitorMutation.isPending}
                      onClick={() => setMonitorMutation.mutate({ userId: user.id, isMonitor: !u.isMonitor })}
                    >
                      {u.isMonitor ? 'モニター' : 'OFF'}
                    </Button>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {user.termsAgreedAt ? (
                      <span title={`版 ${user.termsVersion ?? '-'}`}>
                        {new Date(user.termsAgreedAt).toLocaleDateString('ja-JP')}
                        <span className="text-muted-foreground ml-1">({user.termsVersion ?? '-'})</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">記録なし</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{relativeDays(user.lastSignedIn)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString('ja-JP') : '-'}
                  </TableCell>
                  <TableCell>
                    {user.authProvider === 'email' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs whitespace-nowrap"
                        onClick={() => openResetDialog(user.id)}
                      >
                        <Key className="h-3.5 w-3.5 mr-1" />
                        PW再設定
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>パスワードリセット</DialogTitle>
            <DialogDescription>
              ユーザーの新しいパスワードを入力してください
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">新しいパスワード</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="10文字以上、英字・数字・記号のうち2種類以上"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={resetPasswordMutation.isPending}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetDialogOpen(false)}
              disabled={resetPasswordMutation.isPending}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={resetPasswordMutation.isPending || !newPassword}
            >
              {resetPasswordMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              リセット
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 決済失敗ユーザー一覧パネル
// ─────────────────────────────────────────────────────────────────────────
function PaymentIssuesPanel() {
  const { data, isLoading, refetch } = trpc.admin.listPaymentIssues.useQuery();
  const resendMutation = trpc.admin.resendPaymentFailureEmail.useMutation({
    onSuccess: () => toast.success('リマインダーメールを再送しました'),
    onError: (e) => toast.error(e.message ?? '再送に失敗しました'),
  });

  const statusLabel = (s: string) => {
    if (s === 'past_due') return { label: '決済失敗（リトライ中）', cls: 'bg-amber-100 text-amber-800' };
    if (s === 'unpaid') return { label: '停止中（最終失敗）', cls: 'bg-red-100 text-red-800' };
    if (s === 'incomplete') return { label: '初回未完了', cls: 'bg-yellow-100 text-yellow-800' };
    return { label: s, cls: 'bg-muted text-foreground' };
  };

  return (
    <Card className="border-red-200">
      <CardHeader className="bg-red-50/40">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              決済失敗ユーザー一覧
            </CardTitle>
            <CardDescription className="mt-1">
              past_due / unpaid / incomplete のサブスク。最近のものから表示。
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            更新
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            ✅ 現在、決済失敗中のユーザーはいません
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ユーザー</TableHead>
                  <TableHead>メール</TableHead>
                  <TableHead>プラン</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead>最終更新</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((it) => {
                  const s = statusLabel(it.status);
                  return (
                    <TableRow key={it.subscriptionId}>
                      <TableCell>
                        <div className="font-medium">{it.userName ?? '-'}</div>
                        <div className="text-xs text-muted-foreground">user #{it.userId}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{it.userEmail ?? '-'}</TableCell>
                      <TableCell>{it.planId}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${s.cls}`}>
                          {s.label}
                        </span>
                        {it.cancelAtPeriodEnd && (
                          <span className="ml-1 text-xs text-muted-foreground">(解約予約)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {it.updatedAt ? new Date(it.updatedAt).toLocaleString('ja-JP') : '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resendMutation.mutate({ userId: it.userId })}
                          disabled={resendMutation.isPending || !it.userEmail}
                        >
                          <Mail className="w-3 h-3 mr-1" />
                          リマインダー再送
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

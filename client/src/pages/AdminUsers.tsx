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
import { Loader2, Key, AlertTriangle, Mail, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminUsers() {
  const breadcrumbItems = [
    { label: '管理者', href: '/dashboard' },
    { label: 'ユーザー管理' },
  ];

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');

  const { data: users, isLoading, refetch } = trpc.admin.getAllUsers.useQuery();
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

      <Card>
        <CardHeader>
          <CardTitle>ユーザー管理</CardTitle>
          <CardDescription>
            登録ユーザーの一覧とパスワードリセット
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>名前</TableHead>
                <TableHead>メールアドレス</TableHead>
                <TableHead>認証方法</TableHead>
                <TableHead>権限</TableHead>
                <TableHead>登録日</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.id}</TableCell>
                  <TableCell>{user.name || '-'}</TableCell>
                  <TableCell>{user.email || '-'}</TableCell>
                  <TableCell>
                    {user.authProvider === 'email' ? 'メール' : user.authProvider === 'manus' ? 'Manus' : user.authProvider}
                  </TableCell>
                  <TableCell>
                    {user.role === 'admin' ? (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">
                        管理者
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-muted text-foreground">
                        ユーザー
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString('ja-JP') : '-'}
                  </TableCell>
                  <TableCell>
                    {user.authProvider === 'email' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openResetDialog(user.id)}
                      >
                        <Key className="h-4 w-4 mr-1" />
                        パスワードリセット
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
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

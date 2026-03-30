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
import { Loader2, Key } from 'lucide-react';
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
    <div className="container mx-auto py-8">
      <PageBreadcrumb items={breadcrumbItems} />
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
                placeholder="8文字以上、数字または記号を含む"
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

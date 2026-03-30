import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Bug, Wrench, Lightbulb, HelpCircle, MessageSquare, Filter } from 'lucide-react';
import { toast } from 'sonner';

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  new: { label: '新規', variant: 'destructive' },
  in_progress: { label: '対応中', variant: 'default' },
  resolved: { label: '解決済み', variant: 'secondary' },
  wont_fix: { label: '対応不要', variant: 'outline' },
};

const categoryIcons: Record<string, { icon: typeof Bug; label: string; color: string }> = {
  bug: { icon: Bug, label: 'バグ', color: 'text-red-500' },
  usability: { icon: Wrench, label: '使いにくさ', color: 'text-orange-500' },
  feature_request: { icon: Lightbulb, label: '機能要望', color: 'text-yellow-500' },
  other: { icon: HelpCircle, label: 'その他', color: 'text-blue-500' },
};

export default function AdminFeedback() {
  const breadcrumbItems = [
    { label: 'ダッシュボード', href: '/' },
    { label: 'フィードバック管理' },
  ];

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedFeedback, setSelectedFeedback] = useState<any>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [adminNote, setAdminNote] = useState('');

  const { data, isLoading, refetch } = trpc.admin.listMonitorFeedback.useQuery({
    limit: 100,
    offset: 0,
  });

  const updateMutation = trpc.admin.updateFeedbackStatus.useMutation({
    onSuccess: () => {
      toast.success('ステータスを更新しました');
      setSelectedFeedback(null);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || '更新に失敗しました');
    },
  });

  const filteredFeedback = data?.feedback?.filter((item: any) => {
    if (statusFilter === 'all') return true;
    return item.feedback.status === statusFilter;
  }) || [];

  const stats = {
    total: data?.total || 0,
    new: data?.feedback?.filter((f: any) => f.feedback.status === 'new').length || 0,
    inProgress: data?.feedback?.filter((f: any) => f.feedback.status === 'in_progress').length || 0,
    resolved: data?.feedback?.filter((f: any) => f.feedback.status === 'resolved').length || 0,
  };

  const handleUpdate = () => {
    if (!selectedFeedback || !newStatus) return;
    updateMutation.mutate({
      id: selectedFeedback.feedback.id,
      status: newStatus as any,
      adminNote: adminNote.trim() || undefined,
    });
  };

  const openDetail = (item: any) => {
    setSelectedFeedback(item);
    setNewStatus(item.feedback.status);
    setAdminNote(item.feedback.adminNote || '');
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb items={breadcrumbItems} />

      <div className="flex items-center gap-3">
        <MessageSquare className="h-6 w-6 text-emerald-600" />
        <h1 className="text-2xl font-bold text-foreground">モニターフィードバック管理</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">合計</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{stats.new}</p>
            <p className="text-xs text-muted-foreground">新規</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-500">{stats.inProgress}</p>
            <p className="text-xs text-muted-foreground">対応中</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{stats.resolved}</p>
            <p className="text-xs text-muted-foreground">解決済み</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="new">新規</SelectItem>
            <SelectItem value="in_progress">対応中</SelectItem>
            <SelectItem value="resolved">解決済み</SelectItem>
            <SelectItem value="wont_fix">対応不要</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Feedback Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">フィードバック一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredFeedback.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>フィードバックはまだありません</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">ID</TableHead>
                    <TableHead>カテゴリ</TableHead>
                    <TableHead>ページ</TableHead>
                    <TableHead>内容</TableHead>
                    <TableHead>ユーザー</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>日時</TableHead>
                    <TableHead className="w-[80px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFeedback.map((item: any) => {
                    const cat = categoryIcons[item.feedback.category] || categoryIcons.other;
                    const CatIcon = cat.icon;
                    const status = statusLabels[item.feedback.status] || statusLabels.new;

                    return (
                      <TableRow key={item.feedback.id}>
                        <TableCell className="text-muted-foreground">#{item.feedback.id}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <CatIcon className={`h-3.5 w-3.5 ${cat.color}`} />
                            <span className="text-xs">{cat.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.feedback.page}</TableCell>
                        <TableCell>
                          <p className="text-sm max-w-[300px] truncate">{item.feedback.content}</p>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{item.userName || '不明'}</p>
                            <p className="text-xs text-muted-foreground">{item.userEmail}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(item.feedback.createdAt).toLocaleDateString('ja-JP')}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetail(item)}
                          >
                            詳細
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

      {/* Detail Dialog */}
      <Dialog open={!!selectedFeedback} onOpenChange={(open) => !open && setSelectedFeedback(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>フィードバック詳細 #{selectedFeedback?.feedback?.id}</DialogTitle>
            <DialogDescription>
              {selectedFeedback?.userName} ({selectedFeedback?.userEmail})
            </DialogDescription>
          </DialogHeader>

          {selectedFeedback && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="outline">
                  {categoryIcons[selectedFeedback.feedback.category]?.label || 'その他'}
                </Badge>
                <span className="text-muted-foreground">ページ: {selectedFeedback.feedback.page}</span>
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm whitespace-pre-wrap">{selectedFeedback.feedback.content}</p>
              </div>

              <div className="text-xs text-muted-foreground">
                投稿日時: {new Date(selectedFeedback.feedback.createdAt).toLocaleString('ja-JP')}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">ステータス変更</label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">新規</SelectItem>
                    <SelectItem value="in_progress">対応中</SelectItem>
                    <SelectItem value="resolved">解決済み</SelectItem>
                    <SelectItem value="wont_fix">対応不要</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">管理者メモ</label>
                <Textarea
                  placeholder="対応メモを残す..."
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedFeedback(null)}>
              キャンセル
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

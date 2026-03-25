import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, Edit, Play, Plus } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const POST_TYPE_LABELS: Record<string, string> = {
  hook_tree: 'フック型ツリー投稿',
  expertise: '専門性アピール投稿',
  local: '地域密着型投稿',
  proof: '実績証明投稿',
  empathy: '共感型投稿',
  story: 'ストーリー型投稿',
  list: 'リスト型投稿',
};

export default function AITemplates() {
  const breadcrumbItems = [
    { label: 'AI投稿', href: '/dashboard' },
    { label: 'テンプレート管理' },
  ];

  const [, setLocation] = useLocation();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editTemplate, setEditTemplate] = useState<any | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    postType: 'hook_tree',
    isPublic: false,
  });

  const { data, isLoading, refetch } = trpc.template.list.useQuery({ limit: 50, offset: 0 });
  const deleteMutation = trpc.template.delete.useMutation({
    onSuccess: () => {
      toast.success('テンプレートを削除しました');
      refetch();
      setDeleteId(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.template.update.useMutation({
    onSuccess: () => {
      toast.success('テンプレートを更新しました');
      refetch();
      setEditTemplate(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleDelete = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId !== null) {
      deleteMutation.mutate({ id: deleteId });
    }
  };

  const handleEdit = (template: any) => {
    setEditTemplate(template);
  };

  const saveEdit = () => {
    if (!editTemplate) return;
    updateMutation.mutate({
      id: editTemplate.id,
      name: editTemplate.name,
      description: editTemplate.description,
      postType: editTemplate.postType,
      isPublic: editTemplate.isPublic,
    });
  };

  const handleUseTemplate = (template: any) => {
    // Navigate to AI generation page with template ID
    setLocation(`/ai-generate?templateId=${template.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container py-8">
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">AI生成テンプレート</h1>
          <p className="text-muted-foreground mt-2">
            よく使う生成パターンをテンプレートとして保存し、ワンクリックで再利用できます
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ThreadsAccountSwitcher />
          <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          新規作成
          </Button>
        </div>
      </div>

      {!data?.templates || data.templates.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              テンプレートがまだありません。AI生成画面から「テンプレートとして保存」ボタンでテンプレートを作成できます。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.templates.map((template) => (
            <Card key={template.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {POST_TYPE_LABELS[template.postType] || template.postType}
                    </CardDescription>
                    {template.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {template.description}
                      </p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Badge variant={template.isPublic ? 'default' : 'secondary'}>
                      {template.isPublic ? '公開' : '非公開'}
                    </Badge>
                    <Badge variant="outline">
                      使用回数: {template.usageCount}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleUseTemplate(template)}
                    >
                      <Play className="w-4 h-4 mr-1" />
                      使用
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(template)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(template.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>テンプレートを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。テンプレートが完全に削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <Dialog open={editTemplate !== null} onOpenChange={() => setEditTemplate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>テンプレートを編集</DialogTitle>
            <DialogDescription>
              テンプレートの名前、説明、公開設定を変更できます。
            </DialogDescription>
          </DialogHeader>
          {editTemplate && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">テンプレート名</Label>
                <Input
                  id="edit-name"
                  value={editTemplate.name}
                  onChange={(e) => setEditTemplate({ ...editTemplate, name: e.target.value })}
                  placeholder="例: 新規顧客獲得用"
                />
              </div>
              <div>
                <Label htmlFor="edit-description">説明（任意）</Label>
                <Textarea
                  id="edit-description"
                  value={editTemplate.description || ''}
                  onChange={(e) => setEditTemplate({ ...editTemplate, description: e.target.value })}
                  placeholder="このテンプレートの用途を説明してください"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="edit-postType">投稿タイプ</Label>
                <Select
                  value={editTemplate.postType}
                  onValueChange={(value) => setEditTemplate({ ...editTemplate, postType: value })}
                >
                  <SelectTrigger id="edit-postType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(POST_TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-isPublic"
                  checked={editTemplate.isPublic}
                  onChange={(e) => setEditTemplate({ ...editTemplate, isPublic: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label htmlFor="edit-isPublic">公開する（他のユーザーも使用可能）</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTemplate(null)}>
              キャンセル
            </Button>
            <Button onClick={saveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新しいテンプレートを作成</DialogTitle>
            <DialogDescription>
              AI生成画面から「テンプレートとして保存」ボタンを使用することをお勧めします。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              テンプレートを作成するには、AI生成画面で投稿を生成した後、「テンプレートとして保存」ボタンをクリックしてください。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              閉じる
            </Button>
            <Button onClick={() => {
              setCreateDialogOpen(false);
              setLocation('/ai-generate');
            }}>
              AI生成画面へ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

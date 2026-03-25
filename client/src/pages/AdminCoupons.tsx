import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Edit, Trash2, BarChart } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

const COUPON_TYPE_LABELS: Record<string, string> = {
  forever_free: '永久無料',
  trial_30: '30日間トライアル',
  trial_14: '14日間トライアル',
};

interface CouponFormData {
  code: string;
  type: 'forever_free' | 'trial_30' | 'trial_14';
  description: string;
  maxUses: string;
  expiresAt: string;
}

export default function AdminCoupons() {
  const breadcrumbItems = [
    { label: '管理者', href: '/dashboard' },
    { label: 'クーポン管理' },
  ];

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editingCoupon, setEditingCoupon] = useState<any | null>(null);
  const [formData, setFormData] = useState<CouponFormData>({
    code: '',
    type: 'trial_30',
    description: '',
    maxUses: '',
    expiresAt: '',
  });

  const { data, isLoading, refetch } = trpc.admin.listCoupons.useQuery({ limit: 100, offset: 0 });
  const createMutation = trpc.admin.createCoupon.useMutation({
    onSuccess: () => {
      toast.success('キャンペーンコードを作成しました');
      refetch();
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.admin.updateCoupon.useMutation({
    onSuccess: () => {
      toast.success('キャンペーンコードを更新しました');
      refetch();
      setIsEditDialogOpen(false);
      setEditingCoupon(null);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.admin.deleteCoupon.useMutation({
    onSuccess: () => {
      toast.success('キャンペーンコードを削除しました');
      refetch();
      setDeleteId(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      code: '',
      type: 'trial_30',
      description: '',
      maxUses: '',
      expiresAt: '',
    });
  };

  const handleCreate = () => {
    createMutation.mutate({
      code: formData.code,
      type: formData.type,
      description: formData.description || undefined,
      maxUses: formData.maxUses ? parseInt(formData.maxUses) : undefined,
      expiresAt: formData.expiresAt ? new Date(formData.expiresAt) : undefined,
    });
  };

  const handleEdit = (coupon: any) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      type: coupon.type,
      description: coupon.description || '',
      maxUses: coupon.maxUses?.toString() || '',
      expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 16) : '',
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!editingCoupon) return;
    
    updateMutation.mutate({
      id: editingCoupon.id,
      code: formData.code,
      type: formData.type,
      description: formData.description || undefined,
      maxUses: formData.maxUses ? parseInt(formData.maxUses) : undefined,
      expiresAt: formData.expiresAt ? new Date(formData.expiresAt) : null,
    });
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

  const coupons = data?.coupons || [];
  const total = data?.total || 0;

  return (
    <div className="container max-w-6xl py-8">
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">キャンペーンコード管理</h1>
          <p className="text-muted-foreground">
            キャンペーンコードの作成・編集・無効化ができます（全{total}件）
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          新規作成
        </Button>
      </div>

      {coupons.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            まだキャンペーンコードがありません。新規作成ボタンから作成してください。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {coupons.map((coupon: any) => (
            <Card key={coupon.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle className="text-xl font-mono">{coupon.code}</CardTitle>
                      <Badge variant={coupon.isActive ? 'default' : 'secondary'}>
                        {coupon.isActive ? '有効' : '無効'}
                      </Badge>
                      <Badge variant="outline">
                        {COUPON_TYPE_LABELS[coupon.type]}
                      </Badge>
                    </div>
                    {coupon.description && (
                      <CardDescription>{coupon.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(coupon)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(coupon.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">使用回数</p>
                    <p className="font-medium">
                      {coupon.usedCount} / {coupon.maxUses || '無制限'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">有効期限</p>
                    <p className="font-medium">
                      {coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString('ja-JP') : '無期限'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">作成日</p>
                    <p className="font-medium">
                      {new Date(coupon.createdAt).toLocaleDateString('ja-JP')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>キャンペーンコード作成</DialogTitle>
            <DialogDescription>
              新しいキャンペーンコードを作成します
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="code">コード *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="例: SUMMER2024"
              />
            </div>
            <div>
              <Label htmlFor="type">タイプ *</Label>
              <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="forever_free">永久無料</SelectItem>
                  <SelectItem value="trial_30">30日間トライアル</SelectItem>
                  <SelectItem value="trial_14">14日間トライアル</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="キャンペーンの説明"
              />
            </div>
            <div>
              <Label htmlFor="maxUses">最大使用回数</Label>
              <Input
                id="maxUses"
                type="number"
                value={formData.maxUses}
                onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
                placeholder="空欄で無制限"
              />
            </div>
            <div>
              <Label htmlFor="expiresAt">有効期限</Label>
              <Input
                id="expiresAt"
                type="datetime-local"
                value={formData.expiresAt}
                onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleCreate} disabled={!formData.code || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              作成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>キャンペーンコード編集</DialogTitle>
            <DialogDescription>
              キャンペーンコードを編集します
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-code">コード *</Label>
              <Input
                id="edit-code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-type">タイプ *</Label>
              <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="forever_free">永久無料</SelectItem>
                  <SelectItem value="trial_30">30日間トライアル</SelectItem>
                  <SelectItem value="trial_14">14日間トライアル</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-description">説明</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-maxUses">最大使用回数</Label>
              <Input
                id="edit-maxUses"
                type="number"
                value={formData.maxUses}
                onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-expiresAt">有効期限</Label>
              <Input
                id="edit-expiresAt"
                type="datetime-local"
                value={formData.expiresAt}
                onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleUpdate} disabled={!formData.code || updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>キャンペーンコードを削除しますか？</AlertDialogTitle>
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
    </div>
  );
}

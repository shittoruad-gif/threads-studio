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
import { Loader2, Plus, Edit, Trash2, ArrowLeft, Sparkles, Activity, Coffee, ShoppingBag, Briefcase, Dumbbell, UserPlus, RefreshCw, Calendar, Package, MessageCircle, TrendingUp, BookOpen, List } from 'lucide-react';
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
import { useLocation } from 'wouter';

const CATEGORY_LABELS: Record<string, string> = {
  industry: '業種別',
  purpose: '目的別',
  post_type: '投稿タイプ別',
};

const POST_TYPE_LABELS: Record<string, string> = {
  hook_tree: 'フック型ツリー投稿',
  story: 'ストーリー型投稿',
  list: 'リスト型投稿',
};

const ICON_MAP: Record<string, any> = {
  Activity, Sparkles, Coffee, ShoppingBag, Briefcase, Dumbbell,
  UserPlus, RefreshCw, Calendar, Package, MessageCircle, TrendingUp, BookOpen, List,
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

interface PresetFormData {
  category: string;
  name: string;
  description: string;
  icon: string;
  postType: string;
  defaultParams: string;
  displayOrder: string;
}

const emptyForm: PresetFormData = {
  category: 'industry',
  name: '',
  description: '',
  icon: 'Sparkles',
  postType: 'hook_tree',
  defaultParams: JSON.stringify({
    businessType: '',
    targetAudience: '',
    tone: '',
    keywords: [],
  }, null, 2),
  displayOrder: '0',
};

export default function AdminPresets() {
  const [, setLocation] = useLocation();
  const breadcrumbItems = [
    { label: '管理者', href: '/dashboard' },
    { label: 'プリセット管理' },
  ];

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editingPreset, setEditingPreset] = useState<any | null>(null);
  const [formData, setFormData] = useState<PresetFormData>(emptyForm);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const { data: presets, isLoading, refetch } = trpc.preset.list.useQuery();

  const createMutation = trpc.admin.createPreset.useMutation({
    onSuccess: () => {
      toast.success('プリセットを作成しました');
      refetch();
      setIsCreateDialogOpen(false);
      setFormData(emptyForm);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.admin.updatePreset.useMutation({
    onSuccess: () => {
      toast.success('プリセットを更新しました');
      refetch();
      setIsEditDialogOpen(false);
      setEditingPreset(null);
      setFormData(emptyForm);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.admin.deletePreset.useMutation({
    onSuccess: () => {
      toast.success('プリセットを削除しました');
      refetch();
      setDeleteId(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreate = () => {
    try {
      JSON.parse(formData.defaultParams);
    } catch {
      toast.error('デフォルトパラメータのJSON形式が不正です');
      return;
    }
    createMutation.mutate({
      category: formData.category,
      name: formData.name,
      description: formData.description || undefined,
      icon: formData.icon || undefined,
      postType: formData.postType,
      defaultParams: formData.defaultParams,
      displayOrder: parseInt(formData.displayOrder) || 0,
    });
  };

  const handleEdit = (preset: any) => {
    setEditingPreset(preset);
    setFormData({
      category: preset.category,
      name: preset.name,
      description: preset.description || '',
      icon: preset.icon || 'Sparkles',
      postType: preset.postType,
      defaultParams: typeof preset.defaultParams === 'string'
        ? preset.defaultParams
        : JSON.stringify(preset.defaultParams, null, 2),
      displayOrder: preset.displayOrder?.toString() || '0',
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!editingPreset) return;
    try {
      JSON.parse(formData.defaultParams);
    } catch {
      toast.error('デフォルトパラメータのJSON形式が不正です');
      return;
    }
    updateMutation.mutate({
      id: editingPreset.id,
      name: formData.name,
      description: formData.description || null,
      icon: formData.icon || null,
      postType: formData.postType,
      defaultParams: formData.defaultParams,
      displayOrder: parseInt(formData.displayOrder) || 0,
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

  const filteredPresets = presets?.filter((p: any) =>
    filterCategory === 'all' ? true : p.category === filterCategory
  ) || [];

  const renderIcon = (iconName: string) => {
    const IconComponent = ICON_MAP[iconName];
    if (IconComponent) {
      return <IconComponent className="w-5 h-5" />;
    }
    return <Sparkles className="w-5 h-5" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const formFields = (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">プリセット名 *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="例: 整体院・接骨院"
          />
        </div>
        <div>
          <Label htmlFor="category">カテゴリ *</Label>
          <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="industry">業種別</SelectItem>
              <SelectItem value="purpose">目的別</SelectItem>
              <SelectItem value="post_type">投稿タイプ別</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="description">説明</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="プリセットの説明"
          rows={2}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="icon">アイコン</Label>
          <Select value={formData.icon} onValueChange={(value) => setFormData({ ...formData, icon: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ICON_OPTIONS.map((icon) => (
                <SelectItem key={icon} value={icon}>
                  <div className="flex items-center gap-2">
                    {renderIcon(icon)}
                    <span>{icon}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="postType">投稿タイプ *</Label>
          <Select value={formData.postType} onValueChange={(value) => setFormData({ ...formData, postType: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hook_tree">フック型ツリー投稿</SelectItem>
              <SelectItem value="story">ストーリー型投稿</SelectItem>
              <SelectItem value="list">リスト型投稿</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="displayOrder">表示順</Label>
          <Input
            id="displayOrder"
            type="number"
            value={formData.displayOrder}
            onChange={(e) => setFormData({ ...formData, displayOrder: e.target.value })}
            placeholder="0"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="defaultParams">デフォルトパラメータ (JSON) *</Label>
        <Textarea
          id="defaultParams"
          value={formData.defaultParams}
          onChange={(e) => setFormData({ ...formData, defaultParams: e.target.value })}
          placeholder='{"businessType": "", "targetAudience": "", "tone": "", "keywords": []}'
          rows={6}
          className="font-mono text-sm"
        />
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto">
        <PageBreadcrumb items={breadcrumbItems} />

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/dashboard')}
              className="text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              戻る
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">プリセット管理</h1>
              <p className="text-gray-500">
                AI生成プリセットの作成・編集・削除（全{presets?.length || 0}件）
              </p>
            </div>
          </div>
          <Button onClick={() => { setFormData(emptyForm); setIsCreateDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            新規作成
          </Button>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={filterCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterCategory('all')}
            className={filterCategory !== 'all' ? 'text-gray-500 border-gray-200 hover:text-gray-700' : ''}
          >
            すべて ({presets?.length || 0})
          </Button>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
            const count = presets?.filter((p: any) => p.category === key).length || 0;
            return (
              <Button
                key={key}
                variant={filterCategory === key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterCategory(key)}
                className={filterCategory !== key ? 'text-gray-500 border-gray-200 hover:text-gray-700' : ''}
              >
                {label} ({count})
              </Button>
            );
          })}
        </div>

        {/* Preset List */}
        {filteredPresets.length === 0 ? (
          <Card className="bg-white border-gray-200">
            <CardContent className="pt-6 text-center text-gray-500">
              プリセットがありません。新規作成ボタンから作成してください。
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredPresets.map((preset: any) => (
              <div
                key={preset.id}
                className="bg-white border border-gray-200 p-5 rounded-xl flex items-start justify-between gap-4"
              >
                <div className="flex items-start gap-4 flex-1">
                  <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 flex-shrink-0">
                    {renderIcon(preset.icon || 'Sparkles')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-gray-900 text-lg">{preset.name}</h3>
                      <Badge variant="outline" className="text-gray-600 border-gray-200">
                        {CATEGORY_LABELS[preset.category] || preset.category}
                      </Badge>
                      <Badge variant="outline" className="text-gray-600 border-gray-200">
                        {POST_TYPE_LABELS[preset.postType] || preset.postType}
                      </Badge>
                      {preset.isSystem && (
                        <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
                          システム
                        </Badge>
                      )}
                    </div>
                    {preset.description && (
                      <p className="text-gray-500 text-sm mb-2">{preset.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span>表示順: {preset.displayOrder}</span>
                      <span>使用回数: {preset.usageCount || 0}</span>
                      <span>作成日: {new Date(preset.createdAt).toLocaleDateString('ja-JP')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(preset)}
                    className="text-gray-500 border-gray-200 hover:text-gray-700"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(preset.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>プリセット作成</DialogTitle>
              <DialogDescription>
                新しいAI生成プリセットを作成します
              </DialogDescription>
            </DialogHeader>
            {formFields}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                キャンセル
              </Button>
              <Button onClick={handleCreate} disabled={!formData.name || createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                作成
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>プリセット編集</DialogTitle>
              <DialogDescription>
                プリセットの内容を編集します
              </DialogDescription>
            </DialogHeader>
            {formFields}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                キャンセル
              </Button>
              <Button onClick={handleUpdate} disabled={!formData.name || updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                更新
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>プリセットを削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                この操作は取り消せません。プリセットが完全に削除されます。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                削除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}

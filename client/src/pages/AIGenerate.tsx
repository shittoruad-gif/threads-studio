import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { ArrowLeft, Sparkles, Loader2, Copy, Check, Calendar, Save, Pencil, X, Search, Trash2, Plus, Star, Pin, PinOff, Eye, FileEdit, Smartphone } from 'lucide-react';
import ThreadsAccountSwitcher from '@/components/ThreadsAccountSwitcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { POST_TYPES, POST_PURPOSES, POST_PURPOSES_LIST } from '@shared/threadsPrompts';
import type { PostPurpose } from '@shared/threadsPrompts';
import { SchedulePostDialog } from '@/components/SchedulePostDialog';
import ThreadsPostPreview from '@/components/ThreadsPostPreview';
import ThreadsPhonePreview from '@/components/ThreadsPhonePreview';
import { useThreadsAccount } from '@/components/ThreadsAccountSwitcher';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type PostType = 'hook_tree' | 'expertise' | 'local' | 'proof' | 'empathy' | 'story' | 'list' | 'offer' | 'enemy' | 'qa' | 'trend' | 'aruaru';

interface GeneratedPost {
  title: string;
  mainPost: string;
  treePosts: string[];
  cta: string;
  hashtags: string[];
  goal: string;
  improvement: string;
  expectedEffect: string;
  timingCandidate: string;
  weeklyImprovementPoint: string;
  hookType?: string;
  cvGoal?: string;
}

export default function AIGenerate() {
  const breadcrumbItems = [
    { label: 'AI投稿', href: '/dashboard' },
    { label: '投稿生成' },
  ];

  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const projectId = searchParams.get('project');
  const historyId = searchParams.get('historyId');
  const templateId = searchParams.get('templateId');

  const [purpose, setPurpose] = useState<PostPurpose | null>(null);
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [postType, setPostType] = useState<PostType>('hook_tree');
  const [treeCount, setTreeCount] = useState<number>(3);
  const [trendWord, setTrendWord] = useState<string>('');
  const [generatedPost, setGeneratedPost] = useState<GeneratedPost | null>(null);
  const [editedPost, setEditedPost] = useState<GeneratedPost | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'phone'>('edit');
  const { selectedAccount } = useThreadsAccount();
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const [editingProject, setEditingProject] = useState(false);
  const [savePresetDialogOpen, setSavePresetDialogOpen] = useState(false);
  const [editPresetDialogOpen, setEditPresetDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<any>(null);
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');
  const [editPresetForm, setEditPresetForm] = useState({
    name: '',
    description: '',
    postType: 'hook_tree' as string,
    businessType: '',
    targetAudience: '',
    area: '',
    mainProblem: '',
    strength: '',
    proof: '',
  });
  const [editForm, setEditForm] = useState({
    businessType: '',
    area: '',
    target: '',
    mainProblem: '',
    strength: '',
    proof: '',
    usp: '',
    n1Customer: '',
  });

  const { data: project, isLoading: projectLoading } = trpc.project.get.useQuery(
    { id: projectId! },
    { enabled: !!projectId }
  );

  const { data: allPresets } = trpc.preset.list.useQuery();
  const { data: customPresets } = trpc.preset.listCustom.useQuery();
  const deletePresetMutation = trpc.preset.deleteCustom.useMutation({
    onSuccess: () => {
      utils.preset.listCustom.invalidate();
      toast.success('カスタムプリセットを削除しました');
    },
  });
  const savePresetMutation = trpc.preset.createCustom.useMutation({
    onSuccess: () => {
      utils.preset.listCustom.invalidate();
      setSavePresetDialogOpen(false);
      setPresetName('');
      setPresetDescription('');
      toast.success('カスタムプリセットを保存しました');
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
  const updatePresetMutation = trpc.preset.updateCustom.useMutation({
    onSuccess: () => {
      utils.preset.listCustom.invalidate();
      setEditPresetDialogOpen(false);
      setEditingPreset(null);
      toast.success('プリセットを更新しました');
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
  const togglePinMutation = trpc.preset.togglePin.useMutation({
    onSuccess: (data) => {
      utils.preset.listCustom.invalidate();
      toast.success(data.isPinned ? 'ピン留めしました' : 'ピン留めを解除しました');
    },
  });

  // Combine system and custom presets, then filter
  const combinedPresets = (() => {
    const system = allPresets || [];
    const custom = (customPresets || []).map(p => ({ ...p, isCustom: true }));
    // Separate pinned and unpinned custom presets
    const pinnedCustom = custom.filter(p => p.isPinned);
    const unpinnedCustom = custom.filter(p => !p.isPinned);
    let combined = selectedCategory === 'custom'
      ? [...pinnedCustom, ...unpinnedCustom]
      : selectedCategory === 'all'
        ? [...pinnedCustom, ...unpinnedCustom, ...system]
        : system.filter(p => p.category === selectedCategory);
    
    // Apply search filter
    if (presetSearchQuery.trim()) {
      const q = presetSearchQuery.toLowerCase();
      combined = combined.filter(p => {
        const name = p.name?.toLowerCase() || '';
        const desc = p.description?.toLowerCase() || '';
        const params = p.defaultParams?.toLowerCase() || '';
        return name.includes(q) || desc.includes(q) || params.includes(q);
      });
    }
    return combined;
  })();
  const filteredPresets = combinedPresets;

  const { data: aiUsage } = trpc.subscription.getAiUsage.useQuery();
  const utils = trpc.useUtils();

  // Load history parameters if historyId is provided
  const { data: historyParams } = trpc.project.regenerateFromHistory.useQuery(
    { historyId: parseInt(historyId!) },
    { enabled: !!historyId }
  );

  // Load template if templateId is provided
  const { data: template } = trpc.template.get.useQuery(
    { id: parseInt(templateId!) },
    { enabled: !!templateId }
  );

  // Update projectId and postType when history params are loaded
  useEffect(() => {
    if (historyParams) {
      if (historyParams.projectId) {
        // Update URL with projectId
        const newParams = new URLSearchParams(window.location.search);
        newParams.set('project', historyParams.projectId);
        newParams.delete('historyId');
        window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
      }
      if (historyParams.postType) {
        setPostType(historyParams.postType as PostType);
      }
    }
  }, [historyParams]);

  // Update postType when template is loaded
  useEffect(() => {
    if (template) {
      setPostType(template.postType as PostType);
      // Parse generationParams to get projectId
      try {
        const params = JSON.parse(template.generationParams);
        if (params.projectId) {
          const newParams = new URLSearchParams(window.location.search);
          newParams.set('project', params.projectId);
          newParams.delete('templateId');
          window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
        }
      } catch (e) {
        console.error('Failed to parse template params:', e);
      }
    }
  }, [template]);

  const incrementPresetUsageMutation = trpc.preset.incrementUsage.useMutation();

  const updateProjectMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.get.invalidate({ id: projectId! });
    },
  });

  const handlePresetSelect = (presetId: number) => {
    const preset = allPresets?.find(p => p.id === presetId);
    if (!preset) return;

    try {
      const params = JSON.parse(preset.defaultParams);
      
      // Set post type from preset
      if (preset.postType) {
        setPostType(preset.postType as PostType);
      }

      // Update project settings from preset params if project exists
      if (projectId && params) {
        const updateData: Record<string, string> = { id: projectId };
        let hasUpdate = false;

        // Map preset params to project fields
        if (params.businessType) {
          updateData.businessType = params.businessType;
          hasUpdate = true;
        }
        if (params.area && params.area !== '（お住まいの地域を入力）') {
          updateData.area = params.area;
          hasUpdate = true;
        }
        if (params.targetAudience) {
          updateData.target = params.targetAudience;
          hasUpdate = true;
        }
        if (params.mainProblem) {
          updateData.mainProblem = params.mainProblem;
          hasUpdate = true;
        }
        if (params.strength) {
          updateData.strength = params.strength;
          hasUpdate = true;
        }
        if (params.proof) {
          updateData.proof = params.proof;
          hasUpdate = true;
        }

        if (hasUpdate) {
          updateProjectMutation.mutate(updateData as any);
        }
      }

      // Increment usage count
      incrementPresetUsageMutation.mutate({ id: presetId });

      // Close dialog and show success message
      setPresetDialogOpen(false);
      const appliedFields = [
        params.businessType && '業種',
        params.targetAudience && 'ターゲット',
        params.mainProblem && '主な悩み',
        params.strength && '強み',
      ].filter(Boolean);
      toast.success(
        `プリセット「${preset.name}」を適用しました` +
        (appliedFields.length > 0 ? `\n（${appliedFields.join('・')}を更新）` : '')
      );
    } catch (e) {
      console.error('Failed to parse preset params:', e);
      toast.error('プリセットの読み込みに失敗しました');
    }
  };

  const saveTemplateMutation = trpc.template.create.useMutation({
    onSuccess: () => {
      toast.success('テンプレートを保存しました');
      setSaveTemplateDialogOpen(false);
      setTemplateName('');
      setTemplateDescription('');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const generateMutation = trpc.project.generatePost.useMutation({
    onSuccess: (data) => {
      setGeneratedPost(data as GeneratedPost);
      setEditedPost(data as GeneratedPost);
      // Invalidate AI usage query to update the counter
      utils.subscription.getAiUsage.invalidate();
    },
    onError: (error) => {
      alert(`エラー: ${error.message}`);
    },
  });

  const handleSaveAsTemplate = () => {
    if (!templateName.trim()) {
      toast.error('テンプレート名を入力してください');
      return;
    }
    if (!project) {
      toast.error('プロジェクトが見つかりません');
      return;
    }

    const generationParams = JSON.stringify({
      projectId: project.id,
      businessType: project.businessType,
      area: project.area,
      target: project.target,
      mainProblem: project.mainProblem,
      strength: project.strength,
      proof: project.proof,
      ctaLink: project.ctaLink,
    });

    saveTemplateMutation.mutate({
      name: templateName,
      description: templateDescription,
      postType,
      generationParams,
      isPublic: false,
    });
  };

  const handleGenerate = () => {
    if (!projectId) return;
    generateMutation.mutate({
      projectId,
      postType,
      treeCount,
      trendWord: postType === 'trend' ? trendWord : undefined,
      purpose: purpose || undefined,
    });
  };

  const handleCopy = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success('コピーしました');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyAll = async () => {
    if (!editedPost) return;
    const allPosts = [editedPost.mainPost, ...editedPost.treePosts].join('\n\n---\n\n');
    await navigator.clipboard.writeText(allPosts);
    setCopiedIndex(-1);
    toast.success('コピーしました');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!projectId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>プロジェクトが見つかりません</CardTitle>
            <CardDescription>有効なプロジェクトを選択してください</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation('/dashboard')}>ダッシュボードに戻る</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (projectLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl py-4 sm:py-8 px-4">
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/dashboard')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">ダッシュボードに戻る</span>
            <span className="sm:hidden">戻る</span>
          </Button>
          <ThreadsAccountSwitcher />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 左側：設定エリア */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{project?.title}</CardTitle>
                <CardDescription>
                  AIが最適なThreads投稿を自動生成します
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* プリセット選択ボタン */}
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-medium">プリセットから選択</h3>
                      <p className="text-sm text-muted-foreground">業種・目的別のテンプレートを使って簡単に生成</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={() => setPresetDialogOpen(true)}>
                        <Sparkles className="w-4 h-4 mr-1" />
                        プリセットを選択
                      </Button>
                      {project && (
                        <Button variant="ghost" size="sm" onClick={() => setSavePresetDialogOpen(true)} title="現在の設定をマイプリセットとして保存">
                          <Plus className="w-4 h-4 mr-1" />
                          保存
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 投稿の目的を選ぶ */}
                <div className="space-y-2">
                  <Label>投稿の目的を選ぶ</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {POST_PURPOSES_LIST.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPurpose(p.id);
                          setShowAllTypes(false);
                          // 推奨タイプの先頭を自動選択
                          setPostType(p.recommendedTypes[0]);
                        }}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          purpose === p.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="text-lg mb-1">{p.icon}</div>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
                      </button>
                    ))}
                  </div>
                  {purpose && (
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                      <p className="text-sm text-foreground">💡 {POST_PURPOSES[purpose].advice}</p>
                    </div>
                  )}
                </div>

                {/* 投稿のスタイルを選ぶ */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>投稿のスタイルを選ぶ</Label>
                    {purpose && (
                      <button
                        type="button"
                        onClick={() => setShowAllTypes(!showAllTypes)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showAllTypes ? '推奨のみ表示' : 'すべて表示'}
                      </button>
                    )}
                  </div>
                  <Select value={postType} onValueChange={(value) => setPostType(value as PostType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const purposeConfig = purpose ? POST_PURPOSES[purpose] : null;
                        const recommended = purposeConfig ? purposeConfig.recommendedTypes : [];
                        const types = Object.values(POST_TYPES);

                        // 目的選択なし or すべて表示: 全タイプ表示
                        if (!purposeConfig || showAllTypes) {
                          return types.map((type) => {
                            const isRecommended = recommended.includes(type.id as PostType);
                            return (
                              <SelectItem key={type.id} value={type.id}>
                                <span className="flex items-center gap-2">
                                  <span>{(type as any).icon}</span>
                                  <span>{type.name}</span>
                                  {isRecommended && <Badge variant="default" className="text-xs py-0 px-1">おすすめ</Badge>}
                                  {(type as any).cvPower === '最高' && <Badge variant="destructive" className="text-xs py-0 px-1">予約に直結</Badge>}
                                </span>
                              </SelectItem>
                            );
                          });
                        }

                        // 目的選択あり: 推奨タイプのみ
                        return recommended.map((typeId) => {
                          const type = POST_TYPES[typeId];
                          return (
                            <SelectItem key={type.id} value={type.id}>
                              <span className="flex items-center gap-2">
                                <span>{(type as any).icon}</span>
                                <span>{type.name}</span>
                                {(type as any).cvPower === '最高' && <Badge variant="destructive" className="text-xs py-0 px-1">予約に直結</Badge>}
                              </span>
                            </SelectItem>
                          );
                        });
                      })()}
                    </SelectContent>
                  </Select>
                  <div className="p-3 bg-muted rounded-lg space-y-1">
                    <p className="text-sm text-foreground">{(POST_TYPES[postType] as any).icon} {POST_TYPES[postType].description}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>作りやすさ: {(POST_TYPES[postType] as any).difficulty === '最低' ? 'とても簡単' : (POST_TYPES[postType] as any).difficulty === '低' ? '簡単' : '普通'}</span>
                      <span>集客への届きやすさ: {(POST_TYPES[postType] as any).cvPower === '最高' ? '★★★★★' : (POST_TYPES[postType] as any).cvPower === '高' ? '★★★★' : '★★★'}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">💡 {(POST_TYPES[postType] as any).tip}</p>
                  </div>
                </div>

                {/* 時事ネタ入力（trend型のみ表示）*/}
                {postType === 'trend' && (
                  <div className="space-y-2">
                    <Label>使いたい時事ネタ・トレンドワード</Label>
                    <Input
                      placeholder="例：高校野球、猛暑、新NISA、大谷翻訳..."
                      value={trendWord}
                      onChange={(e) => setTrendWord(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">今話題のトピックを自分の業種に絡めて、多くの人に見てもらいやすくします</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>追加の返信投稿（任意）</Label>
                  <Select value={treeCount.toString()} onValueChange={(value) => setTreeCount(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">なし（最初の1投稿のみ）</SelectItem>
                      <SelectItem value="1">追加1投稿（詳細を補足）</SelectItem>
                      <SelectItem value="2">追加2投稿</SelectItem>
                      <SelectItem value="3">追加3投稿</SelectItem>
                      <SelectItem value="4">追加4投稿</SelectItem>
                      <SelectItem value="5">追加5投稿（最大）</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    {treeCount === 0
                      ? '最初の1投稿だけを生成します'
                      : `最初の投稿に続けて、追加で${treeCount}投稿分の返信投稿も作ります（詳細や続きを書くのに便利）`
                    }
                  </p>
                </div>

                {/* AI使用状況表示 */}
                {aiUsage && (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">今月のAI生成回数</span>
                      <span className="font-medium">
                        {aiUsage.count} / {aiUsage.limit === -1 ? '無制限' : aiUsage.limit === null ? '-' : `${aiUsage.limit}回`}
                      </span>
                    </div>
                    {aiUsage.limit !== null && aiUsage.limit !== -1 && aiUsage.limit > 0 && (
                      <div className="mt-2 w-full bg-background rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            aiUsage.count / aiUsage.limit >= 0.8
                              ? 'bg-yellow-500'
                              : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min((aiUsage.count / aiUsage.limit) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                    {aiUsage.limit !== null && aiUsage.limit !== -1 && aiUsage.count >= aiUsage.limit && (
                      <p className="text-xs text-yellow-500 mt-2">
                        今月の上限に達しました。プロプラン以上で無制限にご利用いただけます。
                      </p>
                    )}
                  </div>
                )}

                <Button
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                  className="w-full"
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      AI投稿を生成
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* プロジェクト情報 */}
            {project && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base">プロジェクト情報</CardTitle>
                  {!editingProject ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditForm({
                          businessType: project.businessType || '',
                          area: project.area || '',
                          target: project.target || '',
                          mainProblem: project.mainProblem || '',
                          strength: project.strength || '',
                          proof: project.proof || '',
                          usp: (project as any).usp || '',
                          n1Customer: (project as any).n1Customer || '',
                        });
                        setEditingProject(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          updateProjectMutation.mutate({
                            id: projectId!,
                            ...editForm,
                          } as any);
                          setEditingProject(false);
                          toast.success('プロジェクト情報を更新しました');
                        }}
                      >
                        <Check className="h-4 w-4 text-green-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingProject(false)}
                      >
                        <X className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {editingProject ? (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">業種</Label>
                        <Input
                          value={editForm.businessType}
                          onChange={(e) => setEditForm({ ...editForm, businessType: e.target.value })}
                          placeholder="例：整体院、美容サロン"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">地域</Label>
                        <Input
                          value={editForm.area}
                          onChange={(e) => setEditForm({ ...editForm, area: e.target.value })}
                          placeholder="例：東京都渋谷区"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">ターゲット</Label>
                        <Textarea
                          value={editForm.target}
                          onChange={(e) => setEditForm({ ...editForm, target: e.target.value })}
                          placeholder="例：30-50代の女性"
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">主な悩み</Label>
                        <Textarea
                          value={editForm.mainProblem}
                          onChange={(e) => setEditForm({ ...editForm, mainProblem: e.target.value })}
                          placeholder="例：慢性的な腰痛、肩こり"
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">強み・特徴</Label>
                        <Textarea
                          value={editForm.strength}
                          onChange={(e) => setEditForm({ ...editForm, strength: e.target.value })}
                          placeholder="例：国家資格保持者による施術"
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">実績・証拠</Label>
                        <Textarea
                          value={editForm.proof}
                          onChange={(e) => setEditForm({ ...editForm, proof: e.target.value })}
                          placeholder="例：月間100名以上の施術実績"
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">USP（独自の強み）</Label>
                        <Textarea
                          value={editForm.usp}
                          onChange={(e) => setEditForm({ ...editForm, usp: e.target.value })}
                          placeholder="例：産後骨盤矯正専門・国家資格保持者のみ在籍"
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">N1分析（実在の顧客像）</Label>
                        <Textarea
                          value={editForm.n1Customer}
                          onChange={(e) => setEditForm({ ...editForm, n1Customer: e.target.value })}
                          placeholder="実在の1人の顧客のエピソード・言葉・感情"
                          rows={3}
                          className="text-sm"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      {project.businessType && (
                        <div>
                          <span className="font-medium">業種：</span>
                          {project.businessType}
                        </div>
                      )}
                      {project.area && (
                        <div>
                          <span className="font-medium">地域：</span>
                          {project.area}
                        </div>
                      )}
                      {project.target && (
                        <div>
                          <span className="font-medium">ターゲット：</span>
                          {project.target}
                        </div>
                      )}
                      {project.mainProblem && (
                        <div>
                          <span className="font-medium">主な悩み：</span>
                          {project.mainProblem}
                        </div>
                      )}
                      {project.strength && (
                        <div>
                          <span className="font-medium">強み：</span>
                          {project.strength}
                        </div>
                      )}
                      {project.proof && (
                        <div>
                          <span className="font-medium">実績：</span>
                          {project.proof}
                        </div>
                      )}
                      {(project as any).usp && (
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <span className="font-medium text-primary">🎯 USP：</span>
                          <span className="text-sm">{(project as any).usp}</span>
                        </div>
                      )}
                      {(project as any).n1Customer && (
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                          <span className="font-medium text-blue-600">👤 N1顧客像：</span>
                          <p className="text-sm mt-1 text-muted-foreground">{(project as any).n1Customer}</p>
                        </div>
                      )}
                      {!project.businessType && !project.area && !project.target && (
                        <p className="text-muted-foreground text-xs">
                          プロジェクト情報が未設定です。ペンアイコンをクリックして編集してください。
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* 右側：生成結果エリア */}
          <div className="space-y-6">
            {editedPost ? (
              <>
                {/* 表示モード切り替え */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex bg-muted rounded-lg p-1">
                    <button
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        viewMode === 'edit'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setViewMode('edit')}
                    >
                      <FileEdit className="w-4 h-4" />
                      編集
                    </button>
                    <button
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        viewMode === 'preview'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setViewMode('preview')}
                    >
                      <Eye className="w-4 h-4" />
                      プレビュー
                    </button>
                    <button
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        viewMode === 'phone'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setViewMode('phone')}
                    >
                      <Smartphone className="w-4 h-4" />
                      スマホプレビュー
                    </button>
                  </div>
                  {viewMode === 'preview' && (
                    <span className="text-xs text-muted-foreground">Threads上での見え方</span>
                  )}
                  {viewMode === 'phone' && (
                    <span className="text-xs text-muted-foreground">スマートフォンでの見え方</span>
                  )}
                </div>

                {viewMode === 'phone' ? (
                  /* スマホプレビュー表示 */
                  <div className="space-y-4">
                    <ThreadsPhonePreview
                      mainPost={editedPost.mainPost}
                      treePosts={editedPost.treePosts}
                      username={selectedAccount?.threadsUsername || 'あなたのアカウント'}
                      profileImage={selectedAccount?.profilePictureUrl || undefined}
                    />

                    {/* 文字数カウント */}
                    <Card>
                      <CardContent className="py-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">メイン投稿：</span>
                            <span className={`font-medium ${editedPost.mainPost.length > 500 ? 'text-red-500' : 'text-foreground'}`}>
                              {editedPost.mainPost.length} / 500文字
                            </span>
                          </div>
                          {editedPost.treePosts.map((post, i) => (
                            <div key={i}>
                              <span className="text-muted-foreground">ツリー{i + 1}：</span>
                              <span className={`font-medium ${post.length > 500 ? 'text-red-500' : 'text-foreground'}`}>
                                {post.length} / 500文字
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : viewMode === 'preview' ? (
                  /* Threadsプレビュー表示 */
                  <div className="space-y-4">
                    <ThreadsPostPreview
                      username={selectedAccount?.threadsUsername || 'username'}
                      profileImageUrl={selectedAccount?.profilePictureUrl}
                      mainPost={editedPost.mainPost}
                      treePosts={editedPost.treePosts}
                      cta={editedPost.cta}
                      hashtags={editedPost.hashtags}
                      darkMode={true}
                    />

                    {/* ライトモードプレビュー */}
                    <details className="group">
                      <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                        ライトモードで表示
                      </summary>
                      <div className="mt-3">
                        <ThreadsPostPreview
                          username={selectedAccount?.threadsUsername || 'username'}
                          profileImageUrl={selectedAccount?.profilePictureUrl}
                          mainPost={editedPost.mainPost}
                          treePosts={editedPost.treePosts}
                          cta={editedPost.cta}
                          hashtags={editedPost.hashtags}
                          darkMode={false}
                        />
                      </div>
                    </details>

                    {/* 文字数カウント */}
                    <Card>
                      <CardContent className="py-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">メイン投稿：</span>
                            <span className={`font-medium ${editedPost.mainPost.length > 500 ? 'text-red-500' : 'text-foreground'}`}>
                              {editedPost.mainPost.length} / 500文字
                            </span>
                          </div>
                          {editedPost.treePosts.map((post, i) => (
                            <div key={i}>
                              <span className="text-muted-foreground">ツリー{i + 1}：</span>
                              <span className={`font-medium ${post.length > 500 ? 'text-red-500' : 'text-foreground'}`}>
                                {post.length} / 500文字
                              </span>
                            </div>
                          ))}
                          <div>
                            <span className="text-muted-foreground">合計投稿数：</span>
                            <span className="font-medium">
                              {1 + editedPost.treePosts.filter(p => p.trim()).length + (editedPost.cta?.trim() ? 1 : 0)}件
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                <>
                {/* メイン投稿 */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">メイン投稿</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(editedPost.mainPost, 0)}
                      >
                        {copiedIndex === 0 ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={editedPost.mainPost}
                      onChange={(e) =>
                        setEditedPost({ ...editedPost, mainPost: e.target.value })
                      }
                      rows={6}
                      className="font-mono text-sm"
                    />
                  </CardContent>
                </Card>

                {/* ツリー投稿 */}
                {editedPost.treePosts.map((post, index) => (
                  <Card key={index}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">ツリー投稿 {index + 1}</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(post, index + 1)}
                        >
                          {copiedIndex === index + 1 ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={post}
                        onChange={(e) => {
                          const newTreePosts = [...editedPost.treePosts];
                          newTreePosts[index] = e.target.value;
                          setEditedPost({ ...editedPost, treePosts: newTreePosts });
                        }}
                        rows={4}
                        className="font-mono text-sm"
                      />
                    </CardContent>
                  </Card>
                ))}

                {/* CTA */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">CTA（行動喚起）</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={editedPost.cta}
                      onChange={(e) =>
                        setEditedPost({ ...editedPost, cta: e.target.value })
                      }
                      rows={2}
                      className="font-mono text-sm"
                    />
                  </CardContent>
                </Card>

                {/* ハッシュタグ */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">ハッシュタグ</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {editedPost.hashtags.map((tag, index) => (
                        <Badge key={index} variant="secondary">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* メタ情報 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">AIからのアドバイス</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {editedPost.hookType && (
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <span className="font-medium text-primary">🎯 最初の1行の引き方：</span>
                        <span className="text-sm">{editedPost.hookType}</span>
                      </div>
                    )}
                    {editedPost.cvGoal && (
                      <div className="p-2 bg-green-500/10 rounded-lg">
                        <span className="font-medium text-green-600">📊 この投稿の目的：</span>
                        <span className="text-sm">{editedPost.cvGoal}</span>
                      </div>
                    )}
                    <div>
                      <span className="font-medium">投稿の狙い：</span>
                      <p className="mt-1 text-muted-foreground">{editedPost.goal}</p>
                    </div>
                    <div>
                      <span className="font-medium">期待できる効果：</span>
                      <p className="mt-1 text-muted-foreground">{editedPost.expectedEffect}</p>
                    </div>
                    <div>
                      <span className="font-medium">おすすめの投稿時間：</span>
                      <p className="mt-1 text-muted-foreground">{editedPost.timingCandidate}</p>
                    </div>
                    <div>
                      <span className="font-medium">次回試してみること：</span>
                      <p className="mt-1 text-muted-foreground">{editedPost.improvement}</p>
                    </div>
                    <div>
                      <span className="font-medium">今週の改善ヒント：</span>
                      <p className="mt-1 text-muted-foreground">{editedPost.weeklyImprovementPoint}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* 投稿メタ情報 - 編集モード終了 */}
                </>
                )}

                {/* アクションボタン */}
                <div className="flex gap-3">
                  <Button
                    onClick={() => setScheduleDialogOpen(true)}
                    className="flex-1"
                    size="lg"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    予約投稿に追加
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCopyAll}
                    size="lg"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    全てコピー
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setSaveTemplateDialogOpen(true)}
                    size="lg"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    テンプレートとして保存
                  </Button>
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    投稿タイプを選択して「AI投稿を生成」ボタンをクリックしてください
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* 予約投稿ダイアログ */}
      {editedPost && (
        <SchedulePostDialog
          open={scheduleDialogOpen}
          onOpenChange={setScheduleDialogOpen}
          projectId={projectId!}
          postContent={`${editedPost.mainPost}\n\n${editedPost.treePosts.join('\n\n')}\n\n${editedPost.cta}\n\n${editedPost.hashtags.map(t => `#${t}`).join(' ')}`}
        />
      )}

      {/* プリセット選択ダイアログ */}
      <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto w-[95vw] sm:w-auto">
          <DialogHeader>
            <DialogTitle>プリセットを選択</DialogTitle>
            <DialogDescription>
              業種・目的別のテンプレートから選んで、効果的な投稿を簡単に生成できます。
            </DialogDescription>
          </DialogHeader>

          {/* 検索バー */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={presetSearchQuery}
              onChange={(e) => setPresetSearchQuery(e.target.value)}
              placeholder="プリセットを検索…（業種名、ターゲット等）"
              className="pl-9 h-9"
            />
          </div>

          {/* カテゴリタブ */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <Button
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('all')}
            >
              すべて
            </Button>
            <Button
              variant={selectedCategory === 'custom' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('custom')}
            >
              <Star className="h-3 w-3 mr-1" />
              マイプリセット
              {customPresets && customPresets.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{customPresets.length}</Badge>
              )}
            </Button>
            <Button
              variant={selectedCategory === 'industry' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('industry')}
            >
              業種別
            </Button>
            <Button
              variant={selectedCategory === 'purpose' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('purpose')}
            >
              目的別
            </Button>
            <Button
              variant={selectedCategory === 'post_type' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('post_type')}
            >
              投稿タイプ別
            </Button>
          </div>

          {/* プリセットカード一覧 */}
          {filteredPresets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {presetSearchQuery ? (
                <p>「{presetSearchQuery}」に一致するプリセットが見つかりません</p>
              ) : selectedCategory === 'custom' ? (
                <div className="space-y-2">
                  <p>カスタムプリセットがまだありません</p>
                  <p className="text-xs">ダイアログを閉じて、「現在の設定を保存」ボタンから保存できます</p>
                </div>
              ) : (
                <p>プリセットがありません</p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredPresets.map((preset: any) => (
                <Card
                  key={`${preset.isCustom ? 'c' : 's'}-${preset.id}`}
                  className={`cursor-pointer hover:border-primary transition-colors relative group ${preset.isCustom && preset.isPinned ? 'border-primary/50' : ''}`}
                  onClick={() => handlePresetSelect(preset.id)}
                >
                  {preset.isCustom && (
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 w-7 p-0 ${preset.isPinned ? 'opacity-100 text-primary' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePinMutation.mutate({ id: preset.id });
                        }}
                        title={preset.isPinned ? 'ピン留めを解除' : 'ピン留め'}
                      >
                        {preset.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          try {
                            const params = JSON.parse(preset.defaultParams || '{}');
                            setEditPresetForm({
                              name: preset.name || '',
                              description: preset.description || '',
                              postType: preset.postType || 'hook_tree',
                              businessType: params.businessType || '',
                              targetAudience: params.targetAudience || '',
                              area: params.area || '',
                              mainProblem: params.mainProblem || '',
                              strength: params.strength || '',
                              proof: params.proof || '',
                            });
                            setEditingPreset(preset);
                            setEditPresetDialogOpen(true);
                          } catch {
                            toast.error('プリセットの読み込みに失敗しました');
                          }
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('このカスタムプリセットを削除しますか？')) {
                            deletePresetMutation.mutate({ id: preset.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                  {preset.isCustom && preset.isPinned && (
                    <div className="absolute top-2 left-2 z-10">
                      <Pin className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      {preset.isCustom && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                      {!preset.isCustom && preset.icon && <span className="text-lg">{preset.icon}</span>}
                      {preset.name}
                    </CardTitle>
                    {preset.description && (
                      <CardDescription className="text-xs">
                        {preset.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    {(() => {
                      try {
                        const p = JSON.parse(preset.defaultParams);
                        const fields = [
                          p.businessType && `業種: ${p.businessType}`,
                          p.targetAudience && `ターゲット: ${p.targetAudience}`,
                        ].filter(Boolean);
                        return fields.length > 0 ? (
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            {fields.map((f: string, i: number) => <div key={i} className="truncate">{f}</div>)}
                          </div>
                        ) : null;
                      } catch { return null; }
                    })()}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        {POST_TYPES[preset.postType as keyof typeof POST_TYPES]?.name || preset.postType}
                      </Badge>
                      {preset.isCustom ? (
                        <Badge variant="secondary" className="text-xs">カスタム</Badge>
                      ) : (
                        <span>使用回数: {preset.usageCount}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* テンプレート保存ダイアログ */}
      <Dialog open={saveTemplateDialogOpen} onOpenChange={setSaveTemplateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>テンプレートとして保存</DialogTitle>
            <DialogDescription>
              この生成設定をテンプレートとして保存し、後で再利用できます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="template-name">テンプレート名 *</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="例: 新規顧客獲得用"
              />
            </div>
            <div>
              <Label htmlFor="template-description">説明（任意）</Label>
              <Textarea
                id="template-description"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="このテンプレートの用途を説明してください"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSaveAsTemplate} disabled={saveTemplateMutation.isPending}>
              {saveTemplateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* カスタムプリセット保存ダイアログ */}
      <Dialog open={savePresetDialogOpen} onOpenChange={setSavePresetDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>マイプリセットとして保存</DialogTitle>
            <DialogDescription>
              現在の投稿タイプとプロジェクト設定をプリセットとして保存し、次回からワンクリックで呼び出せます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="preset-name">プリセット名 *</Label>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="例: 美容室・新規集客用"
              />
            </div>
            <div>
              <Label htmlFor="preset-description">説明（任意）</Label>
              <Textarea
                id="preset-description"
                value={presetDescription}
                onChange={(e) => setPresetDescription(e.target.value)}
                placeholder="このプリセットの用途を説明してください"
                rows={2}
              />
            </div>
            {project && (
              <div className="p-3 bg-muted rounded-lg text-xs space-y-1">
                <p className="font-medium text-sm mb-2">保存される設定:</p>
                <p>投稿タイプ: {POST_TYPES[postType]?.name || postType}</p>
                {project.businessType && <p>業種: {project.businessType}</p>}
                {project.target && <p>ターゲット: {project.target}</p>}
                {project.area && <p>地域: {project.area}</p>}
                {project.mainProblem && <p>主な悩み: {project.mainProblem}</p>}
                {project.strength && <p>強み: {project.strength}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSavePresetDialogOpen(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => {
                if (!presetName.trim()) {
                  toast.error('プリセット名を入力してください');
                  return;
                }
                if (!project) return;
                const params = JSON.stringify({
                  businessType: project.businessType || '',
                  targetAudience: project.target || '',
                  area: project.area || '',
                  mainProblem: project.mainProblem || '',
                  strength: project.strength || '',
                  proof: project.proof || '',
                });
                savePresetMutation.mutate({
                  name: presetName,
                  description: presetDescription,
                  postType,
                  defaultParams: params,
                });
              }}
              disabled={savePresetMutation.isPending}
            >
              {savePresetMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Star className="w-4 h-4 mr-1" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* カスタムプリセット編集ダイアログ */}
      <Dialog open={editPresetDialogOpen} onOpenChange={(open) => {
        setEditPresetDialogOpen(open);
        if (!open) setEditingPreset(null);
      }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>プリセットを編集</DialogTitle>
            <DialogDescription>
              カスタムプリセットの設定を変更できます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-preset-name">プリセット名 *</Label>
              <Input
                id="edit-preset-name"
                value={editPresetForm.name}
                onChange={(e) => setEditPresetForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例: 美容室・新規集客用"
              />
            </div>
            <div>
              <Label htmlFor="edit-preset-desc">説明（任意）</Label>
              <Input
                id="edit-preset-desc"
                value={editPresetForm.description}
                onChange={(e) => setEditPresetForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="このプリセットの用途"
              />
            </div>
            <div>
              <Label>投稿タイプ</Label>
              <Select value={editPresetForm.postType} onValueChange={(v) => setEditPresetForm(prev => ({ ...prev, postType: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(POST_TYPES).map((type) => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">プロジェクト情報</p>
              <div className="grid gap-3">
                <div>
                  <Label htmlFor="edit-preset-biz">業種</Label>
                  <Input
                    id="edit-preset-biz"
                    value={editPresetForm.businessType}
                    onChange={(e) => setEditPresetForm(prev => ({ ...prev, businessType: e.target.value }))}
                    placeholder="例: 美容室"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-preset-target">ターゲット</Label>
                  <Input
                    id="edit-preset-target"
                    value={editPresetForm.targetAudience}
                    onChange={(e) => setEditPresetForm(prev => ({ ...prev, targetAudience: e.target.value }))}
                    placeholder="例: 20〜40代女性"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-preset-area">地域</Label>
                  <Input
                    id="edit-preset-area"
                    value={editPresetForm.area}
                    onChange={(e) => setEditPresetForm(prev => ({ ...prev, area: e.target.value }))}
                    placeholder="例: 東京都渋谷区"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-preset-problem">主な悩み</Label>
                  <Input
                    id="edit-preset-problem"
                    value={editPresetForm.mainProblem}
                    onChange={(e) => setEditPresetForm(prev => ({ ...prev, mainProblem: e.target.value }))}
                    placeholder="例: 新規集客が難しい"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-preset-strength">強み</Label>
                  <Input
                    id="edit-preset-strength"
                    value={editPresetForm.strength}
                    onChange={(e) => setEditPresetForm(prev => ({ ...prev, strength: e.target.value }))}
                    placeholder="例: オーガニックカラー専門"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-preset-proof">実績・証拠</Label>
                  <Input
                    id="edit-preset-proof"
                    value={editPresetForm.proof}
                    onChange={(e) => setEditPresetForm(prev => ({ ...prev, proof: e.target.value }))}
                    placeholder="例: 口コミ評価4.8"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPresetDialogOpen(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => {
                if (!editPresetForm.name.trim()) {
                  toast.error('プリセット名を入力してください');
                  return;
                }
                if (!editingPreset) return;
                const params = JSON.stringify({
                  businessType: editPresetForm.businessType,
                  targetAudience: editPresetForm.targetAudience,
                  area: editPresetForm.area,
                  mainProblem: editPresetForm.mainProblem,
                  strength: editPresetForm.strength,
                  proof: editPresetForm.proof,
                });
                updatePresetMutation.mutate({
                  id: editingPreset.id,
                  name: editPresetForm.name,
                  description: editPresetForm.description,
                  postType: editPresetForm.postType,
                  defaultParams: params,
                });
              }}
              disabled={updatePresetMutation.isPending}
            >
              {updatePresetMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

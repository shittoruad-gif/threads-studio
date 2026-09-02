import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useLang } from '@/i18n';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { ArrowLeft, ArrowRight, Sparkles, Loader2, Copy, Check, Calendar, Save, Pencil, X, Search, Trash2, Plus, Star, Pin, PinOff, Eye, EyeOff, RotateCcw, FileEdit, Smartphone, Send, Link2, ChevronDown, Settings2, AlertCircle } from 'lucide-react';
import ThreadsAccountSwitcher from '@/components/ThreadsAccountSwitcher';
import PageGuide from '@/components/PageGuide';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { POST_TYPES, POST_PURPOSES, POST_PURPOSES_LIST, POST_TONES, POST_TONES_LIST } from '@shared/threadsPrompts';
import type { PostPurpose, PostTone } from '@shared/threadsPrompts';
import { THREAD_SEGMENT_DELIMITER } from '@shared/const';
import { getSeasonalTopics } from '@shared/seasonalTopics';
import { BUZZ_PATTERNS } from '@shared/buzzPatterns';

// 投稿を「連続投稿（ツリー）」のセグメント区切りで連結する。
// メイン・続きの投稿・最後のひと押し をそれぞれ独立した投稿（返信チェーン）として送るため。
function buildThreadContent(p: { mainPost?: string; treePosts?: string[]; cta?: string }): string {
  return [p.mainPost, ...(p.treePosts || []), p.cta]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(THREAD_SEGMENT_DELIMITER);
}
import { SchedulePostDialog } from '@/components/SchedulePostDialog';
import ThreadsPostPreview from '@/components/ThreadsPostPreview';
import ThreadsPhonePreview from '@/components/ThreadsPhonePreview';
import { useThreadsAccount } from '@/components/ThreadsAccountSwitcher';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import PinGuide from '@/components/PinGuide';
import HelpTooltip from '@/components/HelpTooltip';
import { triggerCelebration } from '@/components/Celebration';
import ErrorGuide from '@/components/ErrorGuide';
import ProjectLinksManager from '@/components/ProjectLinksManager';
import TextareaWithEmoji from '@/components/TextareaWithEmoji';
import PinnedPostWizard from '@/components/PinnedPostWizard';

type PostType = 'hook_tree' | 'expertise' | 'local' | 'proof' | 'empathy' | 'story' | 'list' | 'offer' | 'enemy' | 'qa' | 'trend' | 'aruaru' | 'pinned';

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
  const { t } = useLang();
  const breadcrumbItems = [
    { label: t('AI投稿'), href: '/dashboard' },
    { label: t('投稿生成') },
  ];

  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const projectId = searchParams.get('project');
  const historyId = searchParams.get('historyId');
  const templateId = searchParams.get('templateId');
  // ホーム「いま伸びている型」→「この型で1本作る」から渡される切り口ID
  const recommendedAngle = searchParams.get('angle');
  // Optional: ?postType=pinned lets the dashboard "create your pinned post"
  // CTA jump straight into pinned-post mode.
  const initialPostType = (searchParams.get('postType') as PostType | null) || 'hook_tree';

  const [purpose, setPurpose] = useState<PostPurpose | null>(null);
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [postType, setPostType] = useState<PostType>(initialPostType);
  const [treeCount, setTreeCount] = useState<number>(3);
  const [trendWord, setTrendWord] = useState<string>('');
  // 季節ネタ（今月のおすすめネタ）。選択中のチップの「ラベル：切り口」文字列。空 = 未使用。
  const [seasonalTopic, setSeasonalTopic] = useState<string>('');
  const seasonalTopics = getSeasonalTopics();
  const currentMonth = new Date().getMonth() + 1;
  // 地域トレンド参考投稿（地域で反応の高い投稿→似た投稿を生成）。選択中のID（最大3件）
  const [regionalRefIds, setRegionalRefIds] = useState<number[]>([]);
  const [regionalPanelOpen, setRegionalPanelOpen] = useState(false);
  const [manualRefText, setManualRefText] = useState('');
  // コメントが集まる型（バズパターン）。選択中パターンのid。空 = 未使用。季節ネタと併用可。
  const [buzzPatternId, setBuzzPatternId] = useState<string>('');
  const selectedBuzzPattern = BUZZ_PATTERNS.find((p) => p.id === buzzPatternId);
  const buzzPatternValue = selectedBuzzPattern
    ? `${selectedBuzzPattern.label}：${selectedBuzzPattern.hint}`
    : '';
  const [tone, setTone] = useState<PostTone | null>(null);
  const [generatedPost, setGeneratedPost] = useState<GeneratedPost | null>(null);
  const [editedPost, setEditedPost] = useState<GeneratedPost | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'phone'>('edit');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(() => {
    try { return localStorage.getItem('aigen_intro_dismissed') === '1'; } catch { return false; }
  });
  const dismissIntro = () => {
    setIntroDismissed(true);
    try { localStorage.setItem('aigen_intro_dismissed', '1'); } catch { /* ignore */ }
  };
  // 生成：候補（3案）と生成中フラグ（1案 / 3案）
  const [candidates, setCandidates] = useState<(GeneratedPost & { _postType?: PostType })[] | null>(null);
  const [isGeneratingOptions, setIsGeneratingOptions] = useState(false);
  // ③自動採点：各案のスコアと推薦index
  const [evaluations, setEvaluations] = useState<{ empathy: number; readability: number; topicality: number; total: number; reason: string }[] | null>(null);
  const [recommendedIndex, setRecommendedIndex] = useState<number | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const evaluateMutation = trpc.project.evaluateOptions.useMutation();
  const [isGeneratingSingle, setIsGeneratingSingle] = useState(false);
  const { selectedAccount, selectedAccountId, accounts: connectedAccounts } = useThreadsAccount();

  // ★アカウント切替に生成対象の店舗を追随させる。
  //   マウント直後は動かさない（履歴・テンプレ等の明示的なproject指定を壊さない）。
  //   ユーザーがヘッダーで切り替えた瞬間だけ、そのアカウントの既定店舗へ移動する。
  //   ※このページはwindow.location.searchを直接読むため再マウントが必要＝hrefで遷移。
  const prevAccountIdRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevAccountIdRef.current;
    prevAccountIdRef.current = selectedAccountId;
    if (prev === null || selectedAccountId === null || prev === selectedAccountId) return;
    const current = new URL(window.location.href).searchParams.get('project');
    const target = selectedAccount?.defaultProjectId;
    if (current && target && target !== current) {
      window.location.href = `/ai-generate?project=${target}`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId]);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const publishNow = trpc.threads.post.useMutation({
    onSuccess: () => {
      toast.success(t("Threadsに投稿しました！"));
      setPublishConfirmOpen(false);
      triggerCelebration('first-post');
    },
    onError: (e) => {
      toast.error(e.message || t('投稿に失敗しました。時間をおいて再度お試しください。'));
    },
  });
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const [editingProject, setEditingProject] = useState(false);
  const [savePresetDialogOpen, setSavePresetDialogOpen] = useState(false);
  const [editPresetDialogOpen, setEditPresetDialogOpen] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
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
    storeName: '',
    businessType: '',
    area: '',
    localTerms: '',
    target: '',
    mainProblem: '',
    strength: '',
    proof: '',
    usp: '',
    n1Customer: '',
    belief: '',
    catchphrase: '',
    customerWords: '',
    styleSamples: '',
    ngWords: '',
  });
  // 地元の呼び方：AI提案の候補
  const [localSuggestions, setLocalSuggestions] = useState<{ stations: string[]; nicknames: string[]; landmarks: string[] } | null>(null);
  const suggestLocalTerms = trpc.project.suggestLocalTerms.useMutation({
    onSuccess: (data) => {
      setLocalSuggestions(data);
      const total = data.stations.length + data.nicknames.length + data.landmarks.length;
      if (total === 0) toast.info(t("候補が見つかりませんでした。お手数ですが手入力してください。"));
    },
    onError: (e) => toast.error(e.message),
  });
  // ★商圏の狭い言い切りを既定にしたので、地元ワードが未設定なら
  //   ボタンを押さなくても自動で地図から候補を取りに行く。
  //   （取得したものは候補として表示するだけで、確定はユーザーが行う）
  const autoFetchedAreaRef = useRef<string | null>(null);
  useEffect(() => {
    const area = editForm.area.trim();
    if (!area) return;
    if (editForm.localTerms.trim()) return;      // 既に入力済みなら邪魔しない
    if (localSuggestions) return;                 // 取得済み
    if (suggestLocalTerms.isPending) return;
    if (autoFetchedAreaRef.current === area) return; // 同じエリアで二重に叩かない
    autoFetchedAreaRef.current = area;
    suggestLocalTerms.mutate({
      area,
      businessType: editForm.businessType.trim() || undefined,
    });
  }, [editForm.area, editForm.localTerms, editForm.businessType, localSuggestions, suggestLocalTerms]);

  const appendLocalTerm = (term: string) => {
    setEditForm((prev) => {
      const lines = prev.localTerms.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.includes(term.trim())) return prev;
      return { ...prev, localTerms: [...lines, term.trim()].join('\n') };
    });
  };

  const { data: project, isLoading: projectLoading } = trpc.project.get.useQuery(
    { id: projectId! },
    { enabled: !!projectId }
  );

  // カウンセリング状態（未受診ならバナーを出す）
  const { data: counselingState } = trpc.project.getCounseling.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId },
  );

  const { data: allPresets } = trpc.preset.list.useQuery();
  const { data: customPresets } = trpc.preset.listCustom.useQuery();
  // 地域トレンド参考投稿の一覧・収集・手動追加・削除
  const { data: regionalRefs } = trpc.regional.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId },
  );
  const collectRegional = trpc.regional.collect.useMutation({
    onSuccess: (d) => {
      utils.regional.list.invalidate({ projectId: projectId! });
      toast.success(d.collected > 0
        ? `${t('この地域の人気投稿を')}${d.collected}${t('件集めました')}`
        : t('新しい投稿は見つかりませんでした（既に収集済みの可能性があります）'));
    },
    onError: (e) => toast.error(e.message, { duration: 8000 }),
  });
  const addManualRef = trpc.regional.addManual.useMutation({
    onSuccess: () => {
      utils.regional.list.invalidate({ projectId: projectId! });
      setManualRefText('');
      toast.success(t("参考投稿を追加しました"));
    },
    onError: (e) => toast.error(e.message),
  });
  const removeRef = trpc.regional.remove.useMutation({
    onSuccess: () => utils.regional.list.invalidate({ projectId: projectId! }),
  });

  // 初期プリセットの「非表示」機構（使わないおすすめを隠す。削除ではなく非表示なので戻せる）
  const { data: hiddenItems } = trpc.hidden.list.useQuery();
  const hiddenPresetKeys = new Set((hiddenItems?.preset ?? []).map(String));
  const [showHiddenPresets, setShowHiddenPresets] = useState(false);
  const hidePresetMutation = trpc.hidden.hide.useMutation({
    onSuccess: (_data, variables) => {
      utils.hidden.list.invalidate();
      toast.success(t('このプリセットを非表示にしました'), {
        action: { label: t('取り消す'), onClick: () => unhidePresetMutation.mutate(variables) },
      });
    },
  });
  const unhidePresetMutation = trpc.hidden.unhide.useMutation({
    onSuccess: () => { utils.hidden.list.invalidate(); toast.success(t("プリセットを元に戻しました")); },
  });
  const deletePresetMutation = trpc.preset.deleteCustom.useMutation({
    onSuccess: () => {
      utils.preset.listCustom.invalidate();
      toast.success(t("カスタムプリセットを削除しました"));
    },
  });
  const savePresetMutation = trpc.preset.createCustom.useMutation({
    onSuccess: () => {
      utils.preset.listCustom.invalidate();
      setSavePresetDialogOpen(false);
      setPresetName('');
      setPresetDescription('');
      toast.success(t("カスタムプリセットを保存しました"));
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
      toast.success(t("プリセットを更新しました"));
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
  const togglePinMutation = trpc.preset.togglePin.useMutation({
    onSuccess: (data) => {
      utils.preset.listCustom.invalidate();
      toast.success(data.isPinned ? t('ピン留めしました') : t('ピン留めを解除しました'));
    },
  });

  // Combine system and custom presets, then filter
  const combinedPresets = (() => {
    // 非表示にした初期プリセットを除外（「非表示を表示」中は残し、戻せるようにする）
    const system = (allPresets || []).filter(
      (p: any) => showHiddenPresets || !hiddenPresetKeys.has(String(p.id)),
    );
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
        const hadProject = newParams.has('project');
        newParams.set('project', historyParams.projectId);
        newParams.delete('historyId');
        const nextUrl = `${window.location.pathname}?${newParams.toString()}`;
        if (!hadProject) {
          // ?project= が無い状態（履歴の「再生成」から直接来た）では、
          // このページは window.location.search を初期化時に一度読むだけなので
          // replaceState では反映されない。実遷移させて履歴の店舗で開き直す。
          window.location.href = nextUrl;
          return;
        }
        window.history.replaceState({}, '', nextUrl);
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
      toast.error(t("プリセットの読み込みに失敗しました"));
    }
  };

  const saveTemplateMutation = trpc.template.create.useMutation({
    onSuccess: () => {
      toast.success(t("テンプレートを保存しました"));
      setSaveTemplateDialogOpen(false);
      setTemplateName('');
      setTemplateDescription('');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 3案を並列生成するため、副作用は handleGenerate 側で一括管理する（バインドは素のまま）
  const generateMutation = trpc.project.generatePost.useMutation();

  const handleSaveAsTemplate = () => {
    if (!templateName.trim()) {
      toast.error(t("テンプレート名を入力してください"));
      return;
    }
    if (!project) {
      toast.error(t("プロジェクトが見つかりません"));
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

  // 3案の切り口（投稿タイプ）を決める。目的があれば推奨タイプから、なければ選択中タイプ＋定番で多様化。
  const pickThreeTypes = (): PostType[] => {
    const pool: PostType[] = [];
    if (purpose) pool.push(...POST_PURPOSES[purpose].recommendedTypes);
    pool.push(postType, 'empathy', 'local', 'hook_tree', 'proof');
    const uniq: PostType[] = [];
    for (const t of pool) {
      if (!uniq.includes(t)) uniq.push(t);
      if (uniq.length === 3) break;
    }
    while (uniq.length < 3) uniq.push('hook_tree');
    return uniq.slice(0, 3);
  };

  // 通常：1案だけ生成してそのまま編集画面へ
  const handleGenerateSingle = async () => {
    if (!projectId || isGeneratingSingle || isGeneratingOptions) return;
    setGenerationError(null);
    setCandidates(null);
    setGeneratedPost(null);
    setEditedPost(null);
    setIsGeneratingSingle(true);
    try {
      const data = await generateMutation.mutateAsync({
        projectId,
        postType,
        treeCount: postType === 'pinned' ? 0 : treeCount,
        trendWord: postType === 'trend' ? trendWord : undefined,
        seasonalTopic: seasonalTopic || undefined,
        buzzPattern: buzzPatternValue || undefined,
        regionalRefIds: regionalRefIds.length > 0 ? regionalRefIds : undefined,
        purpose: purpose || undefined,
        tone: tone || undefined,
        // ホームの「いま伸びている型」から来た場合はその切り口で書かせる
        angle: recommendedAngle || undefined,
      });
      setGeneratedPost(data as GeneratedPost);
      setEditedPost(data as GeneratedPost);
      utils.subscription.getAiUsage.invalidate();
      // ★事実ガードが裏付けの無い表現を除去した場合は知らせる（透明性）
      const removed = (data as any)?.factGuardRemoved as string[] | undefined;
      if (removed && removed.length > 0) {
        toast.info(`事実確認のため、裏付けのない表現を${removed.length}件除きました（例：${removed[0]}）`);
      }
      triggerCelebration('first-generation');
    } catch (e: any) {
      setGenerationError(e?.message || 'AI生成に失敗しました。時間をおいて再度お試しください。');
      toast.error(t("AI生成に失敗しました"));
    } finally {
      setIsGeneratingSingle(false);
    }
  };

  const handleGenerate = async () => {
    if (!projectId || isGeneratingOptions || isGeneratingSingle) return;
    setGenerationError(null);
    setCandidates(null);
    setGeneratedPost(null);
    setEditedPost(null);
    setIsGeneratingOptions(true);
    try {
      const types = pickThreeTypes();
      const results = await Promise.all(
        types.map((pt) =>
          generateMutation
            .mutateAsync({
              projectId,
              postType: pt,
              treeCount: pt === 'pinned' ? 0 : treeCount,
              trendWord: pt === 'trend' ? trendWord : undefined,
              seasonalTopic: seasonalTopic || undefined,
              buzzPattern: buzzPatternValue || undefined,
              regionalRefIds: regionalRefIds.length > 0 ? regionalRefIds : undefined,
              purpose: purpose || undefined,
              tone: tone || undefined,
            })
            .then((d) => ({ ...(d as GeneratedPost), _postType: pt }))
            .catch(() => null),
        ),
      );
      const ok = results.filter(Boolean) as (GeneratedPost & { _postType?: PostType })[];
      utils.subscription.getAiUsage.invalidate();
      if (ok.length === 0) {
        setGenerationError('AI生成に失敗しました。時間をおいて再度お試しください。');
        toast.error(t("AI生成に失敗しました"));
      } else {
        setCandidates(ok);
        triggerCelebration('first-generation');
        // ③ AIが3案を採点して最優秀を推薦（補助・非ブロッキング）
        setEvaluations(null);
        setRecommendedIndex(null);
        if (ok.length >= 2) {
          setIsEvaluating(true);
          evaluateMutation
            .mutateAsync({
              options: ok.map((c) => ({
                title: c.title || '',
                mainPost: c.mainPost || '',
                treePosts: c.treePosts || [],
                cta: c.cta || '',
              })),
            })
            .then((r) => {
              setEvaluations(r.evaluations as any);
              setRecommendedIndex(typeof r.recommendedIndex === 'number' ? r.recommendedIndex : null);
            })
            .catch(() => { /* 採点失敗は無視（候補選択は手動でも可能） */ })
            .finally(() => setIsEvaluating(false));
        }
      }
    } finally {
      setIsGeneratingOptions(false);
    }
  };

  // 候補から1案を選んで、従来の編集・投稿フローへ
  const selectCandidate = (c: GeneratedPost) => {
    setGeneratedPost(c);
    setEditedPost(c);
    setCandidates(null);
    setEvaluations(null);
    setRecommendedIndex(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      toast.success(t("コピーしました"));
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      toast.error(t("コピーできませんでした。手動で選択してコピーしてください"));
    }
  };

  const handleCopyAll = async () => {
    if (!editedPost) return;
    const allPosts = [editedPost.mainPost, ...editedPost.treePosts].join('\n\n---\n\n');
    try {
      await navigator.clipboard.writeText(allPosts);
      setCopiedIndex(-1);
      toast.success(t("コピーしました"));
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      toast.error(t("コピーできませんでした。手動で選択してコピーしてください"));
    }
  };

  // 履歴の「再生成」やテンプレ読込は、そのデータが持つ店舗で開く必要がある。
  // ここでピッカーに渡すと「切替中アカウントの既定店舗」で上書きされてしまうため、
  // historyId / templateId があるときは読み込み完了（上のeffectが遷移）を待つ。
  if (!projectId && (historyId || templateId)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!projectId) {
    return <ProjectAutoPicker />;
  }

  if (projectLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bg-background">
      <div className="container max-w-6xl py-4 sm:py-8 px-4">
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/dashboard')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">{t("ダッシュボードに戻る")}</span>
            <span className="sm:hidden">{t("戻る")}</span>
          </Button>
          <ThreadsAccountSwitcher />
        </div>

        {/* カウンセリング誘導バナー（未受診のときだけ表示） */}
        {projectId && counselingState && !counselingState.counseledAt && (
          <Card className="mb-6 border-primary/40 bg-primary/5">
            <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t("AIが「事実だけ」で書けるように、最初にカウンセリングを受けませんか？")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("使ってよい数字・実例・メニュー・よくある質問・原体験・NG項目を最初に教えると、AIが勝手な数字や架空エピソードを作らず、全ジャンルのネタを正確に量産できます。全13問・約5分（「なし」ワンタップでスキップ可）。")}
                </p>
              </div>
              <Button
                onClick={() => setLocation(`/ai-counseling?project=${projectId}`)}
                className="shrink-0"
              >
                {t("カウンセリングを始める")}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* カウンセリング済みのとき：内容の確認・修正導線 */}
        <PageGuide steps={[
          <>{t('プロフィールに固定する投稿を作るなら、黄色い枠の')}<b>{t('固定投稿モードにする')}</b>{t('を押します')}</>,
          <><b>{t('投稿の目的を選ぶ')}</b>{t('から1つタップします（迷ったら「予約・LINE登録を増やしたい」）')}</>,
          <><b>{t('AI投稿を生成')}</b>{t('を押して10〜30秒待ちます')}</>,
          <>{t('内容を確認して')}<b>{t('今すぐThreadsに投稿')}</b>{t('、または')}<b>{t('投稿を予約する')}</b>{t('で日時指定')}</>,
        ]} />

        {/* truncateだとスマホで「カ...」だけになるため、短いラベル＋折返し許可にしている */}
        {projectId && counselingState && counselingState.counseledAt && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
            <p className="text-sm text-emerald-800 flex items-center gap-2 min-w-0">
              <Check className="h-4 w-4 shrink-0" />
              <span className="leading-snug">{t("お店の情報は入力済み")}</span>
            </p>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
              onClick={() => setLocation(`/ai-counseling?project=${projectId}`)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              {t("確認・修正する")}
            </Button>
          </div>
        )}

        {/* ★固定投稿ウィザード（postType === 'pinned' のときグリッドを丸ごと置き換え） */}
        {postType === 'pinned' && projectId && project && (
          <Card className="border-amber-300">
            <CardContent className="pt-6">
              <PinnedPostWizard
                projectId={projectId}
                project={project}
                onComplete={(post) => {
                  // ウィザード完了 → 編集画面にセット
                  setGeneratedPost(post as any);
                  setEditedPost(post as any);
                  // 通常の編集フロー（グリッド表示）に戻す
                  setPostType('hook_tree');
                  // 直後に pinned モードの状態を保持しつつスクロール
                  setTimeout(() => {
                    document.getElementById('generated-post-section')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
                onCancel={() => setPostType('hook_tree')}
              />
            </CardContent>
          </Card>
        )}

        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${postType === 'pinned' ? 'hidden' : ''}`}>
          {/* 左側：設定エリア */}
          <div className="space-y-6 min-w-0">
            {/* 誘導用URL登録 — 1度設定すれば固定投稿/自動投稿で自動的に使い回される */}
            {projectId && project && (
              <ProjectLinksManager
                projectId={projectId}
                initialLinksJson={(project as any).links || null}
              />
            )}

            <Card>
              <CardHeader>
                <CardTitle>{project?.title}</CardTitle>
                <CardDescription>
                  {t("AIが最適なThreads投稿を自動生成します")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* はじめての方へ：3ステップ案内（閉じると再表示なし） */}
                {!introDismissed && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-primary" />
                        {t("はじめての方へ：3ステップで完成します")}
                      </p>
                      <button
                        type="button"
                        onClick={dismissIntro}
                        aria-label={t("この案内を閉じる")}
                        className="text-muted-foreground/60 hover:text-foreground shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                      <li><span className="font-medium text-primary">①</span> <span className="text-foreground">{t("投稿の目的を選ぶ")}</span>{t("（迷ったら「予約・LINE登録を増やしたい」でOK）")}</li>
                      <li><span className="font-medium text-primary">②</span> <span className="text-foreground">{t("「AI投稿を生成」")}</span>{t("を押す（細かい設定は不要です）")}</li>
                      <li><span className="font-medium text-primary">③</span> {t("内容を確認して")} <span className="text-foreground">{t("「今すぐThreadsに投稿」または「予約する」")}</span></li>
                    </ol>
                  </div>
                )}
                {/* ★固定投稿の入口（従来は「詳細設定」の中に隠れていて見つけられなかった）。
                    プロフィール最上部に固定する最重要投稿なので、常に見える位置に置く。 */}
                <div className={`p-4 rounded-lg border-2 ${postType === 'pinned' ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/10'}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-bold text-foreground flex items-center gap-1.5">
                        📌 {t("固定投稿を作る")}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                        {postType === 'pinned'
                          ? t("いま固定投稿モードです。下の「AI投稿を生成」を押すと、プロフィールに固定する用の投稿ができます。")
                          : t("プロフィールの一番上に固定する「お店の入口」。LINE登録や予約に最もつながる投稿です。まだの方はこれから作りましょう。")}
                      </p>
                      {/* ★作って投稿しただけでは効果が出ない。Threads側でピン留めして
                          はじめて入口になるので、手順をここに常に置く。 */}
                      <PinGuide />
                    </div>
                    <div className="shrink-0">
                      {postType === 'pinned' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto border-amber-400 text-amber-800 hover:bg-amber-100"
                          onClick={() => setPostType('hook_tree')}
                        >
                          {t("通常の投稿に戻す")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white"
                          onClick={() => setPostType('pinned')}
                        >
                          <Pin className="w-4 h-4 mr-1" />
                          {t("固定投稿モードにする")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* プリセット選択ボタン */}
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-medium flex items-center gap-1.5">
                        {t("プリセットから選択")}
                        <HelpTooltip content="過去に保存した設定や、業種・目的別のおすすめ設定を呼び出して、入力の手間なく生成できます。初めての方は使わなくてもOKです。" />
                      </h3>
                      <p className="text-sm text-muted-foreground">{t("業種・目的別のテンプレートを使って簡単に生成")}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={() => setPresetDialogOpen(true)}>
                        <Sparkles className="w-4 h-4 mr-1" />
                        {t("プリセットを選択")}
                      </Button>
                      {project && (
                        <Button variant="ghost" size="sm" onClick={() => setSavePresetDialogOpen(true)} title={t("現在の設定をマイプリセットとして保存")}>
                          <Plus className="w-4 h-4 mr-1" />
                          {t("保存")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 投稿の目的を選ぶ */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>{t("投稿の目的を選ぶ")}</Label>
                    <HelpTooltip content={t("投稿の目的によって、AIが生成する投稿のスタイルが変わります")} />
                  </div>
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
                        <div className="text-sm font-medium">{t(p.name)}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{t(p.description)}</div>
                      </button>
                    ))}
                  </div>
                  {purpose && (
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                      <p className="text-sm text-foreground">💡 {t(POST_PURPOSES[purpose].advice)}</p>
                    </div>
                  )}
                </div>

                {/* 詳細設定トグル（初心者はそのまま生成でOK） */}
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                    {t("詳細設定（スタイル・返信数・口調）")}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </button>
                {!showAdvanced && (
                  <p className="text-xs text-muted-foreground -mt-1">
                    {t("そのまま下の「AI投稿を生成」を押せば、目的に合った投稿が作れます。細かく調整したいときだけ開いてください。")}
                  </p>
                )}

                {showAdvanced && (
                <div className="space-y-4 border-l-2 border-primary/20 pl-3">
                {/* 投稿のスタイルを選ぶ */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Label>{t("投稿のスタイルを選ぶ")}</Label>
                      <HelpTooltip content="投稿の型（テンプレート）を選びます。業種や目的に合ったスタイルを選ぶと効果的です" />
                    </div>
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
                                  {isRecommended && <Badge variant="default" className="text-xs py-0 px-1">{t("おすすめ")}</Badge>}
                                  {(type as any).cvPower === '最高' && <Badge variant="destructive" className="text-xs py-0 px-1">{t("予約に直結")}</Badge>}
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
                                {(type as any).cvPower === '最高' && <Badge variant="destructive" className="text-xs py-0 px-1">{t("予約に直結")}</Badge>}
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
                    <Label>{t("使いたい時事ネタ・トレンドワード")}</Label>
                    <Input
                      placeholder={t("例：高校野球、猛暑、新NISA、大谷翻訳...")}
                      value={trendWord}
                      onChange={(e) => setTrendWord(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">{t("今話題のトピックを自分の業種に絡めて、多くの人に見てもらいやすくします")}</p>
                  </div>
                )}

                {/* 季節ネタ（今月のおすすめネタ）。選択は任意。もう一度押すと解除。 */}
                {seasonalTopics.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label>🗓 {currentMonth}月のおすすめネタ（任意）</Label>
                      <HelpTooltip content="季節に合った投稿は共感されやすく反応が上がりやすいです。選ぶと、そのネタを軸にAIが投稿を作ります。もう一度押すと解除できます" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {seasonalTopics.map((t) => {
                        const value = `${t.label}：${t.hint}`;
                        const selected = seasonalTopic === value;
                        return (
                          <button
                            key={t.label}
                            type="button"
                            onClick={() => setSeasonalTopic(selected ? '' : value)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                              selected
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-background text-foreground/80 border-border hover:bg-emerald-50 hover:border-emerald-300'
                            }`}
                          >
                            {selected ? '✓ ' : ''}{t.label}
                          </button>
                        );
                      })}
                    </div>
                    {seasonalTopic && (
                      <p className="text-xs text-emerald-700">
                        {t("このネタを軸に、お店の強みへ自然につなげた投稿を作ります")}
                      </p>
                    )}
                  </div>
                )}

                {/* コメントが集まる型（実際のThreadsバズ投稿リサーチ由来）。選択は任意・季節ネタと併用可 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>{t("💬 コメントが集まる型（任意）")}</Label>
                    <HelpTooltip content="実際のThreadsでポジティブにバズっている投稿を分析した「型」です。選ぶと、温かいコメントや会話が生まれやすい構成で投稿を作ります。もう一度押すと解除できます" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {BUZZ_PATTERNS.map((p) => {
                      const selected = buzzPatternId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setBuzzPatternId(selected ? '' : p.id)}
                          title={p.description}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            selected
                              ? 'bg-sky-600 text-white border-sky-600'
                              : 'bg-background text-foreground/80 border-border hover:bg-sky-50 hover:border-sky-300'
                          }`}
                        >
                          {selected ? '✓ ' : `${p.emoji} `}{p.label}
                        </button>
                      );
                    })}
                  </div>
                  {selectedBuzzPattern && (
                    <p className="text-xs text-sky-700">
                      {selectedBuzzPattern.emoji} {selectedBuzzPattern.description}
                    </p>
                  )}
                </div>

                {/* 地域トレンド：この地域で反応の高い投稿を集めて「似た投稿」を作る */}
                <div className="space-y-2 rounded-xl border border-border p-3">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between text-left"
                    onClick={() => setRegionalPanelOpen((v) => !v)}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {t("📍 地域トレンド（この地域で伸びている投稿を参考にする）")}
                      {regionalRefIds.length > 0 && (
                        <Badge className="bg-emerald-600 text-white text-xs px-1.5 py-0">{regionalRefIds.length}件 選択中</Badge>
                      )}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${regionalPanelOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {regionalPanelOpen && (
                    <div className="space-y-3 pt-1">
                      <p className="text-xs text-muted-foreground">
                        この地域で反応の高い投稿を参考に、<span className="font-medium text-foreground">{t("丸写しではない「似た切り口」の投稿")}</span>をAIが作ります。参考にしたい投稿を選んで（最大3件）、そのまま「AI投稿を生成」を押してください。
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => collectRegional.mutate({ projectId: projectId! })}
                          disabled={collectRegional.isPending}
                        >
                          {collectRegional.isPending ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />{t("収集中...")}</>
                          ) : (
                            <><Search className="h-3.5 w-3.5 mr-1.5" />{t("この地域の人気投稿を集める")}</>
                          )}
                        </Button>
                      </div>

                      {/* 手動追加（審査承認前でも使える） */}
                      <div className="space-y-1.5">
                        <Textarea
                          placeholder={t("Threadsで見つけた「この地域で伸びている投稿」の本文を貼り付けて追加できます")}
                          value={manualRefText}
                          onChange={(e) => setManualRefText(e.target.value)}
                          className="text-xs min-h-[56px]"
                          maxLength={2000}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          disabled={manualRefText.trim().length < 10 || addManualRef.isPending}
                          onClick={() => addManualRef.mutate({ projectId: projectId!, text: manualRefText })}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />手動で追加
                        </Button>
                      </div>

                      {/* 参考投稿一覧（選択式） */}
                      {(regionalRefs || []).length === 0 ? (
                        <p className="text-xs text-muted-foreground/70 italic">
                          {t("まだ参考投稿がありません。「集める」ボタンか手動追加で登録してください。")}
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {(regionalRefs || []).map((r) => {
                            const on = regionalRefIds.includes(r.id);
                            return (
                              <div
                                key={r.id}
                                className={`rounded-lg border p-2.5 text-xs cursor-pointer transition-colors ${
                                  on ? 'border-emerald-500 bg-emerald-50' : 'border-border hover:bg-muted/40'
                                }`}
                                onClick={() => setRegionalRefIds((prev) =>
                                  on ? prev.filter((x) => x !== r.id)
                                     : prev.length >= 3 ? (toast.info(t("参考にできるのは3件までです")), prev) : [...prev, r.id],
                                )}
                              >
                                <div className="flex items-start gap-2">
                                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[12px] ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-muted-foreground/40'}`}>
                                    {on ? '✓' : ''}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="whitespace-pre-wrap break-words line-clamp-4 text-foreground">{r.text}</p>
                                    <div className="flex items-center gap-2 mt-1 text-[12px] text-muted-foreground">
                                      <span>{r.source === 'manual' ? '手動追加' : `自動収集${r.keyword ? `（${r.keyword}）` : ''}`}</span>
                                      {r.permalink && (
                                        <a href={r.permalink} target="_blank" rel="noopener noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>{t("元投稿")}</a>
                                      )}
                                      <button
                                        type="button"
                                        className="ml-auto text-destructive/70 hover:text-destructive"
                                        onClick={(e) => { e.stopPropagation(); removeRef.mutate({ id: r.id }); setRegionalRefIds((prev) => prev.filter((x) => x !== r.id)); }}
                                      >
                                        {t("削除")}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {regionalRefIds.length > 0 && (
                        <p className="text-xs text-emerald-700">
                          選択した{regionalRefIds.length}件の切り口を参考に、あなたのお店の事実だけで「似た投稿」を作ります（文章の丸写しはしません）
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* 固定投稿は常に1投稿のみ。treeCount セレクタは隠す。 */}
                {postType !== 'pinned' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label>{t("追加の返信投稿（任意）")}</Label>
                      <HelpTooltip content="メイン投稿に続くツリー（返信）の数です。3〜5本がおすすめです" />
                    </div>
                    <Select value={treeCount.toString()} onValueChange={(value) => setTreeCount(parseInt(value))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">{t("なし（最初の1投稿のみ）")}</SelectItem>
                        <SelectItem value="1">{t("追加1投稿（詳細を補足）")}</SelectItem>
                        <SelectItem value="2">{t("追加2投稿")}</SelectItem>
                        <SelectItem value="3">{t("追加3投稿")}</SelectItem>
                        <SelectItem value="4">{t("追加4投稿")}</SelectItem>
                        <SelectItem value="5">{t("追加5投稿（最大）")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      {treeCount === 0
                        ? '最初の1投稿だけを生成します'
                        : `最初の投稿に続けて、追加で${treeCount}投稿分の返信投稿も作ります（詳細や続きを書くのに便利）`
                      }
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-sm text-amber-900">
                      📌 <strong>{t("固定投稿モード")}</strong>：1投稿で完結する形式で生成します。Threadsのプロフィール上部に固定して使ってください。
                    </p>
                    <p className="text-xs text-amber-800 mt-1">
                      {t("生成後、投稿の右上「…」→「プロフィールに固定」でThreads側の固定設定ができます。")}
                    </p>
                  </div>
                )}

                {/* 口調の選択 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>{t("口調を選ぶ（任意）")}</Label>
                    <HelpTooltip content="投稿の文体・トーンを選びます。選ばない場合はAIが自動で判断します" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTone(null)}
                      className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                        tone === null
                          ? 'border-primary bg-primary/5 text-foreground font-medium'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      {t("🤖 おまかせ")}
                    </button>
                    {POST_TONES_LIST.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTone(t.id)}
                        className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                          tone === t.id
                            ? 'border-primary bg-primary/5 text-foreground font-medium'
                            : 'border-border text-muted-foreground hover:border-primary/50'
                        }`}
                      >
                        {t.icon} {t.name}
                      </button>
                    ))}
                  </div>
                  {tone && POST_TONES[tone] && (
                    <p className="text-xs text-muted-foreground">{POST_TONES[tone].description}</p>
                  )}
                </div>
                </div>
                )}

                {/* AI使用状況表示 */}
                {aiUsage && (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t("今月のAI生成回数")}</span>
                      <span className="font-medium">
                        {aiUsage.count} / {aiUsage.limit === -1 ? t('無制限') : aiUsage.limit === null ? '-' : `${aiUsage.limit}${t('回')}`}
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
                    {aiUsage.limit !== null && aiUsage.limit !== -1 && aiUsage.count >= aiUsage.limit && (() => {
                      const now = new Date();
                      const reset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                      const resetStr = `${reset.getMonth() + 1}月1日`;
                      return (
                        <div className="mt-3 bg-red-50 border-2 border-red-200 rounded-lg p-3">
                          <p className="text-sm font-bold text-red-700 flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            今月のAI生成回数（{aiUsage.limit}回）を使い切りました
                          </p>
                          <p className="text-xs text-red-600 mt-1">
                            回数は <strong>{resetStr}</strong> に自動でリセットされます。今すぐ続けたい場合はプランのアップグレードで上限が増えます。
                          </p>
                          <Button
                            size="sm"
                            className="mt-2 w-full bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => setLocation('/pricing')}
                          >
                            {t("プランをアップグレードして続ける")}
                          </Button>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {(() => {
                  const quotaReached = aiUsage?.limit !== null && aiUsage?.limit !== undefined && aiUsage?.limit !== -1 && (aiUsage?.count ?? 0) >= aiUsage.limit;
                  const busy = isGeneratingSingle || isGeneratingOptions;
                  return (
                    <>
                      <Button
                        onClick={handleGenerateSingle}
                        disabled={busy || quotaReached}
                        className="w-full h-12 text-base"
                      >
                        {isGeneratingSingle ? (
                          <><Loader2 className="h-5 w-5 mr-2 animate-spin" />{t("生成中...")}</>
                        ) : (
                          <><Sparkles className="h-5 w-5 mr-2" />{t("AI投稿を生成")}</>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleGenerate}
                        disabled={busy || quotaReached}
                        className="w-full h-11"
                      >
                        {isGeneratingOptions ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("3案を生成中...")}</>
                        ) : (
                          <>{t("3案から選んで作る（AI生成3回分）")}</>
                        )}
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        {t("まず1案だけ作ります。いろいろ見比べたいときは「3案から選んで作る」を押してください。")}
                      </p>
                    </>
                  );
                })()}

                {/* AI Generation Error Guide */}
                {generationError && (
                  <div className="mt-4">
                    <ErrorGuide
                      type="ai-generation-failed"
                      message={generationError}
                      onRetry={() => {
                        setGenerationError(null);
                        handleGenerate();
                      }}
                      compact
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* プロジェクト情報 */}
            {project && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base">{t("プロジェクト情報")}</CardTitle>
                  {!editingProject ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("プロジェクト情報を編集")}
                      onClick={() => {
                        setEditForm({
                          storeName: (project as any).storeName || '',
                          businessType: project.businessType || '',
                          area: project.area || '',
                          localTerms: (project as any).localTerms || '',
                          target: project.target || '',
                          mainProblem: project.mainProblem || '',
                          strength: project.strength || '',
                          proof: project.proof || '',
                          usp: (project as any).usp || '',
                          n1Customer: (project as any).n1Customer || '',
                          belief: (project as any).belief || '',
                          catchphrase: (project as any).catchphrase || '',
                          customerWords: (project as any).customerWords || '',
                          styleSamples: (project as any).styleSamples || '',
                          ngWords: (project as any).ngWords || '',
                        });
                        setLocalSuggestions(null);
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
                        aria-label={t("変更を保存")}
                        onClick={() => {
                          updateProjectMutation.mutate({
                            id: projectId!,
                            ...editForm,
                          } as any);
                          setEditingProject(false);
                          toast.success(t("プロジェクト情報を更新しました"));
                        }}
                      >
                        <Check className="h-4 w-4 text-green-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t("編集をキャンセル")}
                        onClick={() => {
                          // Check if form has changes
                          const hasChanges =
                            editForm.businessType !== (project?.businessType || '') ||
                            editForm.area !== (project?.area || '') ||
                            editForm.target !== (project?.target || '') ||
                            editForm.mainProblem !== (project?.mainProblem || '') ||
                            editForm.strength !== (project?.strength || '') ||
                            editForm.proof !== (project?.proof || '');
                          if (hasChanges) {
                            if (confirm('変更を破棄しますか？')) {
                              setEditingProject(false);
                            }
                          } else {
                            setEditingProject(false);
                          }
                        }}
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
                        <Label className="text-xs text-muted-foreground">{t("店名（任意・一度入れれば毎回使われます）")}</Label>
                        <Input
                          value={editForm.storeName}
                          onChange={(e) => setEditForm({ ...editForm, storeName: e.target.value })}
                          placeholder={t("例：○○整体院")}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t("業種")}</Label>
                        <Input
                          value={editForm.businessType}
                          onChange={(e) => setEditForm({ ...editForm, businessType: e.target.value })}
                          placeholder={t("例：整体院、美容サロン")}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t("地域")}</Label>
                        <Input
                          value={editForm.area}
                          onChange={(e) => setEditForm({ ...editForm, area: e.target.value })}
                          placeholder={t("例：岡山県岡山市北区下中野（できるだけ詳しく）")}
                          className="h-8 text-sm"
                        />
                        <p className="text-[13px] text-muted-foreground">{t("市区町村だけでなく町名まで入れると、地元の呼び方の精度が上がります。")}</p>
                      </div>

                      {/* 地元での呼び方（地域集客の精度を上げる） */}
                      <div className="space-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-xs font-medium text-emerald-800">{t("地元での呼び方（最寄り駅・通称・ランドマーク）")}</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                            disabled={!editForm.area.trim() || suggestLocalTerms.isPending}
                            onClick={() => suggestLocalTerms.mutate({ area: editForm.area.trim(), businessType: editForm.businessType.trim() || undefined })}
                          >
                            {suggestLocalTerms.isPending
                              ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />{t("検索中...")}</>
                              : <><Search className="h-3 w-3 mr-1" />{t("候補を取り直す")}</>}
                          </Button>
                        </div>
                        <p className="text-[13px] text-emerald-700">
                          {t("住所を入れると、地図データから近くの")}<strong>{t("実在する駅と所要時間")}</strong>{t("を自動で候補表示します（AIの推測は使わないので地名の捏造はありません）。")}
                          <br />
                          {t("所要時間は直線距離からの概算です。実際と違う場合は書き換えてください。")}
                          {t("目印（お店・施設など）は、ご自身が知っている実在のものを1行ずつ追記してください。")}
                        </p>

                        {/* AI候補（タップで下の欄に追加） */}
                        {localSuggestions && (() => {
                          const groups: { label: string; items: string[] }[] = [
                            { label: '駅', items: localSuggestions.stations },
                            { label: '通称・町名', items: localSuggestions.nicknames },
                            { label: '目印', items: localSuggestions.landmarks },
                          ].filter((g) => g.items.length > 0);
                          if (groups.length === 0) return null;
                          return (
                            <div className="space-y-1.5">
                              {groups.map((g) => (
                                <div key={g.label} className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[13px] text-muted-foreground w-14 shrink-0">{g.label}</span>
                                  {g.items.map((it, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => appendLocalTerm(it)}
                                      className="text-xs bg-white border border-emerald-300 hover:bg-emerald-100 rounded-full px-2.5 py-1 inline-flex items-center gap-1 transition-colors"
                                    >
                                      <Plus className="h-3 w-3" />{it}
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        <Textarea
                          value={editForm.localTerms}
                          onChange={(e) => setEditForm({ ...editForm, localTerms: e.target.value })}
                          placeholder={'1行に1つ。例：\n大元駅（JR宇野線）\n下中野エリア\n国道2号沿い'}
                          rows={3}
                          className="text-sm bg-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t("ターゲット")}</Label>
                        <Textarea
                          value={editForm.target}
                          onChange={(e) => setEditForm({ ...editForm, target: e.target.value })}
                          placeholder={t("例：30-50代の女性")}
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t("主な悩み")}</Label>
                        <Textarea
                          value={editForm.mainProblem}
                          onChange={(e) => setEditForm({ ...editForm, mainProblem: e.target.value })}
                          placeholder={t("例：慢性的な腰痛、肩こり")}
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t("強み・特徴")}</Label>
                        <Textarea
                          value={editForm.strength}
                          onChange={(e) => setEditForm({ ...editForm, strength: e.target.value })}
                          placeholder={t("例：国家資格保持者による施術")}
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t("実績・証拠")}</Label>
                        <Textarea
                          value={editForm.proof}
                          onChange={(e) => setEditForm({ ...editForm, proof: e.target.value })}
                          placeholder={t("例：月間100名以上の施術実績")}
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t("USP（独自の強み）")}</Label>
                        <Textarea
                          value={editForm.usp}
                          onChange={(e) => setEditForm({ ...editForm, usp: e.target.value })}
                          placeholder={t("例：産後骨盤矯正専門・国家資格保持者のみ在籍")}
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t("N1分析（実在の顧客像）")}</Label>
                        <Textarea
                          value={editForm.n1Customer}
                          onChange={(e) => setEditForm({ ...editForm, n1Customer: e.target.value })}
                          placeholder={t("実在の1人の顧客のエピソード・言葉・感情")}
                          rows={3}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t("主張・信念")}</Label>
                        <Textarea
                          value={editForm.belief}
                          onChange={(e) => setEditForm({ ...editForm, belief: e.target.value })}
                          placeholder={t("例：腰痛は薬で抑えるのではなく、根本から整えるべき")}
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t("口癖・方言・決めゼリフ")}</Label>
                        <Input
                          value={editForm.catchphrase}
                          onChange={(e) => setEditForm({ ...editForm, catchphrase: e.target.value })}
                          placeholder={t("例：〜じゃけぇ／今日もあなたの体、諦めんといて")}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t("お客さんが実際に使った言葉")}</Label>
                        <Textarea
                          value={editForm.customerWords}
                          onChange={(e) => setEditForm({ ...editForm, customerWords: e.target.value })}
                          placeholder={t("例：朝起きた瞬間から腰が重い／夕方になると首がバキバキ")}
                          rows={2}
                          className="text-sm"
                        />
                        <p className="text-[13px] text-muted-foreground">{t("最優先で投稿に使われます（一度登録すれば毎回利用）。")}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t("過去の良かった投稿（文体のお手本）")}</Label>
                        <Textarea
                          value={editForm.styleSamples}
                          onChange={(e) => setEditForm({ ...editForm, styleSamples: e.target.value })}
                          placeholder={'反応が良かった過去の投稿を、1〜3本そのまま貼り付け（投稿ごとに空行で区切る）。\nAIが口調・絵文字・改行・文の長さを真似ます（内容ではなく“文体”だけ模倣）。'}
                          rows={5}
                          className="text-sm"
                        />
                        <p className="text-[13px] text-muted-foreground">{t("貼り付けた投稿の「文体」だけを再現します。事実は店舗情報から使うので、お手本の内容はコピーされません。")}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t("投稿に入れたくないワード")}</Label>
                        <Textarea
                          value={editForm.ngWords}
                          onChange={(e) => setEditForm({ ...editForm, ngWords: e.target.value })}
                          placeholder={t("改行またはカンマ区切り（例：激安, 最安値）")}
                          rows={2}
                          className="text-sm"
                        />
                        <p className="text-[13px] text-muted-foreground">{t("この言葉は生成投稿に必ず含めません（自動投稿・量産も含む）。")}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      {project.businessType && (
                        <div>
                          <span className="font-medium">{t("業種：")}</span>
                          {project.businessType}
                        </div>
                      )}
                      {project.area && (
                        <div>
                          <span className="font-medium">{t("地域：")}</span>
                          {project.area}
                        </div>
                      )}
                      {project.target && (
                        <div>
                          <span className="font-medium">{t("ターゲット：")}</span>
                          {project.target}
                        </div>
                      )}
                      {project.mainProblem && (
                        <div>
                          <span className="font-medium">{t("主な悩み：")}</span>
                          {project.mainProblem}
                        </div>
                      )}
                      {project.strength && (
                        <div>
                          <span className="font-medium">{t("強み：")}</span>
                          {project.strength}
                        </div>
                      )}
                      {project.proof && (
                        <div>
                          <span className="font-medium">{t("実績：")}</span>
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
                          <span className="font-medium text-blue-600">{t("👤 N1顧客像：")}</span>
                          <p className="text-sm mt-1 text-muted-foreground">{(project as any).n1Customer}</p>
                        </div>
                      )}
                      {!project.businessType && !project.area && !project.target && (
                        <p className="text-muted-foreground text-xs">
                          {t("プロジェクト情報が未設定です。ペンアイコンをクリックして編集してください。")}
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* 右側：生成結果エリア */}
          <div id="generated-post-section" className="space-y-6 min-w-0">
            {editedPost ? (
              <>
                {/* 生成完了→次の一手を明示 */}
                <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 mb-3 text-sm text-emerald-800">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{t("投稿ができました！内容を確認して、下の「今すぐThreadsに投稿」または「投稿を予約する」を押してください。")}</span>
                </div>
                {/* 表示モード切り替え */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
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
                      {t("編集")}
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
                      {t("プレビュー")}
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
                      {t("スマホプレビュー")}
                    </button>
                  </div>
                  {viewMode === 'preview' && (
                    <span className="text-xs text-muted-foreground">{t("Threads上での見え方")}</span>
                  )}
                  {viewMode === 'phone' && (
                    <span className="text-xs text-muted-foreground">{t("スマートフォンでの見え方")}</span>
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
                            <span className="text-muted-foreground">{t("メイン投稿：")}</span>
                            <span className={`font-medium ${editedPost.mainPost.length > 500 ? 'text-red-500' : 'text-foreground'}`}>
                              {editedPost.mainPost.length} / 500文字
                            </span>
                          </div>
                          {editedPost.treePosts.map((post, i) => (
                            <div key={i}>
                              <span className="text-muted-foreground">続きの投稿{i + 1}：</span>
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
                        {t("ライトモードで表示")}
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
                            <span className="text-muted-foreground">{t("メイン投稿：")}</span>
                            <span className={`font-medium ${editedPost.mainPost.length > 500 ? 'text-red-500' : 'text-foreground'}`}>
                              {editedPost.mainPost.length} / 500文字
                            </span>
                          </div>
                          {editedPost.treePosts.map((post, i) => (
                            <div key={i}>
                              <span className="text-muted-foreground">続きの投稿{i + 1}：</span>
                              <span className={`font-medium ${post.length > 500 ? 'text-red-500' : 'text-foreground'}`}>
                                {post.length} / 500文字
                              </span>
                            </div>
                          ))}
                          <div>
                            <span className="text-muted-foreground">{t("合計投稿数：")}</span>
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
                      <CardTitle className="text-base">{t("メイン投稿")}</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t("メイン投稿をコピー")}
                        onClick={() => handleCopy(editedPost.mainPost, 0)}
                      >
                        {copiedIndex === 0 ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{t("Threadsで最初に表示される一番大事な投稿です。ここで興味を引きます。")}</p>
                  </CardHeader>
                  <CardContent>
                    <TextareaWithEmoji
                      value={editedPost.mainPost}
                      onChange={(v) =>
                        setEditedPost({ ...editedPost, mainPost: v })
                      }
                      rows={10}
                      className="text-[15px] leading-relaxed"
                    />
                  </CardContent>
                </Card>

                {/* ツリー投稿 */}
                {editedPost.treePosts.map((post, index) => (
                  <Card key={index}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">続きの投稿 {index + 1}</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`続きの投稿${index + 1}をコピー`}
                          onClick={() => handleCopy(post, index + 1)}
                        >
                          {copiedIndex === index + 1 ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{t("メイン投稿への返信としてぶら下がる補足です。詳しい説明や続きを書きます。")}</p>
                    </CardHeader>
                    <CardContent>
                      <TextareaWithEmoji
                        value={post}
                        onChange={(v) => {
                          const newTreePosts = [...editedPost.treePosts];
                          newTreePosts[index] = v;
                          setEditedPost({ ...editedPost, treePosts: newTreePosts });
                        }}
                        rows={6}
                        className="text-[15px] leading-relaxed"
                      />
                    </CardContent>
                  </Card>
                ))}

                {/* CTA */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("最後のひと押し（予約・問い合わせの案内）")}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">{t("読者にしてほしい行動（予約・LINE登録・問い合わせ）を促す締めの一文です。")}</p>
                  </CardHeader>
                  <CardContent>
                    <TextareaWithEmoji
                      value={editedPost.cta}
                      onChange={(v) =>
                        setEditedPost({ ...editedPost, cta: v })
                      }
                      rows={2}
                      className="text-[15px] leading-relaxed"
                    />
                  </CardContent>
                </Card>

                {/* ハッシュタグ（#）はThreadsで業者っぽさを出し到達も伸びないため、本ツールでは一切使わない方針。
                    生成・プレビュー・投稿のいずれにも # は含めない。 */}

                {/* メタ情報 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("AIからのアドバイス")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {editedPost.hookType && (
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <span className="font-medium text-primary">{t("🎯 最初の1行の引き方：")}</span>
                        <span className="text-sm">{editedPost.hookType}</span>
                      </div>
                    )}
                    {editedPost.cvGoal && (
                      <div className="p-2 bg-green-500/10 rounded-lg">
                        <span className="font-medium text-green-600">{t("📊 この投稿の目的：")}</span>
                        <span className="text-sm">{editedPost.cvGoal}</span>
                      </div>
                    )}
                    <div>
                      <span className="font-medium">{t("投稿の狙い：")}</span>
                      <p className="mt-1 text-muted-foreground">{editedPost.goal}</p>
                    </div>
                    <div>
                      <span className="font-medium">{t("期待できる効果：")}</span>
                      <p className="mt-1 text-muted-foreground">{editedPost.expectedEffect}</p>
                    </div>
                    <div>
                      <span className="font-medium">{t("おすすめの投稿時間：")}</span>
                      <p className="mt-1 text-muted-foreground">{editedPost.timingCandidate}</p>
                    </div>
                    {/* トピックタグ候補（Threadsの投稿画面で「トピックを追加」に貼る。発見性UP） */}
                    {(() => {
                      const candidates = Array.from(new Set([
                        ...(editForm.mainProblem || '').split(/[、,・\s/]+/).filter((s) => s.length >= 2 && s.length <= 12).slice(0, 2),
                        (editForm.businessType || '').split(/[（(]/)[0].trim(),
                        (editForm.area || '').split(/[都道府県市区町村]/).filter(Boolean).pop()?.trim() ?? '',
                      ].filter((s) => s && s.length >= 2 && s.length <= 12)));
                      if (candidates.length === 0) return null;
                      return (
                        <div>
                          <span className="font-medium">{t("トピックタグ候補：")}</span>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {candidates.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(tag).then(
                                    () => toast.success(`「${tag}」をコピーしました。Threadsの「トピックを追加」に貼り付けてください`),
                                    () => toast.error(t("コピーに失敗しました")),
                                  );
                                }}
                                className="px-2.5 py-1 rounded-full text-xs bg-muted hover:bg-emerald-50 hover:text-emerald-700 border border-border transition-colors"
                              >
                                #{tag} 📋
                              </button>
                            ))}
                          </div>
                          <p className="text-[13px] text-muted-foreground mt-1">{t("タップでコピー。投稿時にThreadsの「トピックを追加」へ貼ると見つけてもらいやすくなります")}</p>
                        </div>
                      );
                    })()}
                    <div>
                      <span className="font-medium">{t("次回試してみること：")}</span>
                      <p className="mt-1 text-muted-foreground">{editedPost.improvement}</p>
                    </div>
                    <div>
                      <span className="font-medium">{t("今週の改善ヒント：")}</span>
                      <p className="mt-1 text-muted-foreground">{editedPost.weeklyImprovementPoint}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* 投稿メタ情報 - 編集モード終了 */}
                </>
                )}

                {/* アクションボタン */}
                <div className="sticky bottom-4 z-10 bg-background/95 backdrop-blur-sm border border-border rounded-xl p-3 shadow-lg space-y-2">
                  {/* 未連携のときは投稿前に連携を促す */}
                  {(connectedAccounts?.length ?? 0) === 0 && (
                    <div className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
                      <Link2 className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1">{t("投稿するにはThreadsの連携が必要です。")}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 border-yellow-300 text-yellow-800 hover:bg-yellow-100"
                        onClick={() => setLocation('/threads-connect')}
                      >
                        {t("連携する")}
                      </Button>
                    </div>
                  )}
                  {/* 主アクション：今すぐ投稿 */}
                  <Button
                    onClick={() => setPublishConfirmOpen(true)}
                    disabled={(connectedAccounts?.length ?? 0) === 0 || !selectedAccountId}
                    className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Send className="h-5 w-5 mr-2" />
                    {t('今すぐThreadsに投稿')}
                  </Button>
                  {/* 副アクション */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setScheduleDialogOpen(true)}
                      className="flex-1 h-11"
                    >
                      <Calendar className="h-5 w-5 mr-2" />
                      {t("投稿を予約する")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCopyAll}
                      className="flex-1 h-11"
                    >
                      <Copy className="h-5 w-5 mr-2" />
                      {t("全てコピー")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSaveTemplateDialogOpen(true)}
                      className="flex-1 h-11"
                    >
                      <Save className="h-5 w-5 mr-2" />
                      {t("ひな形に保存")}
                    </Button>
                  </div>
                </div>
              </>
            ) : candidates ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">{t("3案できました。使いたい案を選んでください")}</h3>
                  {isEvaluating && (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{t("AIが採点中…")}</span>
                  )}
                </div>
                {candidates.map((c, i) => {
                  const ev = evaluations?.[i];
                  const isRecommended = recommendedIndex === i;
                  return (
                  <Card
                    key={i}
                    className={`cursor-pointer transition-colors ${isRecommended ? 'border-2 border-amber-400 bg-amber-50/40' : 'hover:border-primary'}`}
                    onClick={() => selectCandidate(c)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm flex items-center gap-2 min-w-0">
                          <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">{i + 1}</span>
                          <span className="truncate">{(c._postType && POST_TYPES[c._postType]?.name) || '案'}</span>
                          {isRecommended && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-400 text-amber-950 text-[12px] font-bold px-2 py-0.5">{t("⭐AIのおすすめ")}</span>
                          )}
                        </CardTitle>
                        <Button
                          size="sm"
                          className="shrink-0"
                          onClick={(e) => { e.stopPropagation(); selectCandidate(c); }}
                        >
                          {t("この案を使う")}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-line line-clamp-4 text-foreground">{c.mainPost}</p>
                      {c.treePosts && c.treePosts.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">＋続きの投稿 {c.treePosts.length}本</p>
                      )}
                      {ev && (
                        <div className="mt-2 pt-2 border-t border-border/60">
                          <div className="flex items-center gap-2 flex-wrap text-[13px] text-muted-foreground">
                            <span className="font-bold text-foreground">AI採点 {Math.round(ev.total)}点</span>
                            <span>共感{Math.round(ev.empathy)}</span>
                            <span>読みやすさ{Math.round(ev.readability)}</span>
                            <span>話題性{Math.round(ev.topicality)}</span>
                          </div>
                          {ev.reason && <p className="text-[13px] text-muted-foreground mt-1">{ev.reason}</p>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  );
                })}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleGenerate}
                  disabled={isGeneratingOptions}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {t("別の3案を作り直す")}
                </Button>
              </div>
            ) : (isGeneratingOptions || isGeneratingSingle) ? (
              <Card className="lg:h-full lg:min-h-[420px]">
                <CardContent className="flex flex-col items-center justify-center h-full py-12 text-center">
                  <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                  <p className="text-foreground font-medium mb-1">{isGeneratingOptions ? '3案を生成しています…' : '投稿を生成しています…'}</p>
                  <p className="text-sm text-muted-foreground">{t("少しお待ちください（10〜30秒ほど）")}</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="lg:h-full lg:min-h-[420px] border-dashed">
                <CardContent className="flex flex-col items-center justify-center h-full py-12 text-center">
                  <Sparkles className="h-12 w-12 text-primary/40 mb-4" />
                  <p className="text-foreground font-medium mb-1">{t("ここに投稿の下書きが表示されます")}</p>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    {t("左の「投稿の目的を選ぶ」から目的を選んで、")}<br />
                    {t("「AI投稿を生成」を押すと下書きができます。")}
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
          postContent={buildThreadContent(editedPost)}
        />
      )}

      {/* 今すぐ投稿の確認ダイアログ */}
      <Dialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-emerald-600" />
              {t('今すぐ投稿しますか？')}
            </DialogTitle>
            <DialogDescription>
              {t('内容と投稿先のアカウントを、もう一度ご確認ください。')}
            </DialogDescription>
          </DialogHeader>
          {/* 投稿先アカウントを明示（誤投稿防止） */}
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm">
            <Send className="h-4 w-4 text-blue-600 shrink-0" />
            <span className="text-blue-800">{t('投稿先：')}</span>
            <span className="font-bold text-blue-900 truncate">{selectedAccount ? `@${selectedAccount.threadsUsername}` : t('（アカウント未選択）')}</span>
          </div>
          {/* 取り消し不可の警告 */}
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            <span className="text-sm font-semibold text-red-700">{t('公開後は取り消せません')}</span>
          </div>
          {editedPost && (() => {
            const full = `${editedPost.mainPost}\n\n${editedPost.treePosts.join('\n\n')}\n\n${editedPost.cta}`.trim();
            return (
              <div>
                <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm text-foreground whitespace-pre-line max-h-64 overflow-y-auto">
                  {full}
                </div>
                <p className="text-xs text-muted-foreground mt-1 text-right">
                  合計 {full.length} 文字{editedPost.treePosts.length > 0 ? ` ・ ツリー${editedPost.treePosts.length + 1}投稿` : ''}
                </p>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPublishConfirmOpen(false)} disabled={publishNow.isPending}>
              {t('キャンセル')}
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={publishNow.isPending || !selectedAccountId || !editedPost}
              onClick={() => {
                if (!selectedAccountId || !editedPost) return;
                // ★ツリー投稿は返信権限（Meta審査承認待ち）が必要。権限の無い連携で
                //   送ると1件目だけ公開される事故になるため、送信前に案内して止める。
                if (editedPost.treePosts.length > 0 && (selectedAccount as any)?.hasReplyScope === false) {
                  toast.error(t('連続投稿（ツリー）は、Meta社の追加審査の承認待ちのため、この連携ではまだ使えません。ツリーなし（1投稿）で作り直してから投稿してください。'));
                  return;
                }
                const text = buildThreadContent(editedPost);
                publishNow.mutate({
                  accountId: selectedAccountId,
                  text,
                  // 固定投稿は、公式LINEのURLを1件目のコメントとして自動添付する
                  ...(postType === 'pinned' && projectId ? { pinnedLineCommentProjectId: projectId } : {}),
                });
              }}
            >
              {publishNow.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('投稿中...')}</> : t('投稿する')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* プリセット選択ダイアログ */}
      <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto w-[95vw] sm:w-auto">
          <DialogHeader>
            <DialogTitle>{t("プリセットを選択")}</DialogTitle>
            <DialogDescription>
              {t("業種・目的別のテンプレートから選んで、効果的な投稿を簡単に生成できます。")}
            </DialogDescription>
          </DialogHeader>

          {/* 検索バー */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={presetSearchQuery}
              onChange={(e) => setPresetSearchQuery(e.target.value)}
              placeholder={t("プリセットを検索…（業種名、ターゲット等）")}
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
              {t("すべて")}
            </Button>
            <Button
              variant={selectedCategory === 'custom' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('custom')}
            >
              <Star className="h-3 w-3 mr-1" />
              {t("マイプリセット")}
              {customPresets && customPresets.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{customPresets.length}</Badge>
              )}
            </Button>
            <Button
              variant={selectedCategory === 'industry' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('industry')}
            >
              {t("業種別")}
            </Button>
            <Button
              variant={selectedCategory === 'purpose' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('purpose')}
            >
              {t("目的別")}
            </Button>
            <Button
              variant={selectedCategory === 'post_type' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('post_type')}
            >
              {t("投稿タイプ別")}
            </Button>
            {hiddenPresetKeys.size > 0 && (
              <Button
                variant={showHiddenPresets ? 'secondary' : 'ghost'}
                size="sm"
                className="ml-auto text-xs"
                onClick={() => setShowHiddenPresets((v) => !v)}
                title={t("非表示にしたプリセットの表示/非表示を切り替え")}
              >
                {showHiddenPresets ? <Eye className="h-3.5 w-3.5 mr-1" /> : <EyeOff className="h-3.5 w-3.5 mr-1" />}
                非表示 {hiddenPresetKeys.size}件
              </Button>
            )}
          </div>

          {/* プリセットカード一覧 */}
          {filteredPresets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {presetSearchQuery ? (
                <p>「{presetSearchQuery}」に一致するプリセットが見つかりません</p>
              ) : selectedCategory === 'custom' ? (
                <div className="space-y-2">
                  <p>{t("カスタムプリセットがまだありません")}</p>
                  <p className="text-xs">{t("ダイアログを閉じて、「現在の設定を保存」ボタンから保存できます")}</p>
                </div>
              ) : (
                <p>{t("プリセットがありません")}</p>
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
                        aria-label={preset.isPinned ? 'ピン留めを解除' : 'ピン留め'}
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
                        aria-label={t("プリセットを編集")}
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
                            toast.error(t("プリセットの読み込みに失敗しました"));
                          }
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        aria-label={t("プリセットを削除")}
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
                  {/* 初期プリセット（非custom）：非表示 / 元に戻す */}
                  {!preset.isCustom && (
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      {hiddenPresetKeys.has(String(preset.id)) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-emerald-700"
                          aria-label={t("このプリセットを元に戻す")}
                          title={t("元に戻す")}
                          onClick={(e) => { e.stopPropagation(); unhidePresetMutation.mutate({ itemType: 'preset', itemKey: String(preset.id) }); }}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />戻す
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          aria-label={t("このプリセットを非表示にする")}
                          title={t("使わないので非表示にする")}
                          onClick={(e) => { e.stopPropagation(); hidePresetMutation.mutate({ itemType: 'preset', itemKey: String(preset.id) }); }}
                        >
                          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
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
                        <Badge variant="secondary" className="text-xs">{t("カスタム")}</Badge>
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
            <DialogTitle>{t("テンプレートとして保存")}</DialogTitle>
            <DialogDescription>
              {t("この生成設定をテンプレートとして保存し、後で再利用できます。")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="template-name">{t("テンプレート名 *")}</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t("例: 新規顧客獲得用")}
              />
            </div>
            <div>
              <Label htmlFor="template-description">{t("説明（任意）")}</Label>
              <Textarea
                id="template-description"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder={t("このテンプレートの用途を説明してください")}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateDialogOpen(false)}>
              {t("キャンセル")}
            </Button>
            <Button onClick={handleSaveAsTemplate} disabled={saveTemplateMutation.isPending}>
              {saveTemplateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("保存")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* カスタムプリセット保存ダイアログ */}
      <Dialog open={savePresetDialogOpen} onOpenChange={setSavePresetDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("マイプリセットとして保存")}</DialogTitle>
            <DialogDescription>
              {t("現在の投稿タイプとプロジェクト設定をプリセットとして保存し、次回からワンクリックで呼び出せます。")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="preset-name">{t("プリセット名 *")}</Label>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder={t("例: 美容室・新規集客用")}
              />
            </div>
            <div>
              <Label htmlFor="preset-description">{t("説明（任意）")}</Label>
              <Textarea
                id="preset-description"
                value={presetDescription}
                onChange={(e) => setPresetDescription(e.target.value)}
                placeholder={t("このプリセットの用途を説明してください")}
                rows={2}
              />
            </div>
            {project && (
              <div className="p-3 bg-muted rounded-lg text-xs space-y-1">
                <p className="font-medium text-sm mb-2">{t("保存される設定:")}</p>
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
              {t("キャンセル")}
            </Button>
            <Button
              onClick={() => {
                if (!presetName.trim()) {
                  toast.error(t("プリセット名を入力してください"));
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
              {t("保存")}
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
            <DialogTitle>{t("プリセットを編集")}</DialogTitle>
            <DialogDescription>
              {t("カスタムプリセットの設定を変更できます。")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-preset-name">{t("プリセット名 *")}</Label>
              <Input
                id="edit-preset-name"
                value={editPresetForm.name}
                onChange={(e) => setEditPresetForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t("例: 美容室・新規集客用")}
              />
            </div>
            <div>
              <Label htmlFor="edit-preset-desc">{t("説明（任意）")}</Label>
              <Input
                id="edit-preset-desc"
                value={editPresetForm.description}
                onChange={(e) => setEditPresetForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t("このプリセットの用途")}
              />
            </div>
            <div>
              <Label>{t("投稿タイプ")}</Label>
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
              <p className="text-sm font-medium mb-3">{t("プロジェクト情報")}</p>
              <div className="grid gap-3">
                <div>
                  <Label htmlFor="edit-preset-biz">{t("業種")}</Label>
                  <Input
                    id="edit-preset-biz"
                    value={editPresetForm.businessType}
                    onChange={(e) => setEditPresetForm(prev => ({ ...prev, businessType: e.target.value }))}
                    placeholder={t("例: 美容室")}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-preset-target">{t("ターゲット")}</Label>
                  <Input
                    id="edit-preset-target"
                    value={editPresetForm.targetAudience}
                    onChange={(e) => setEditPresetForm(prev => ({ ...prev, targetAudience: e.target.value }))}
                    placeholder={t("例: 20〜40代女性")}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-preset-area">{t("地域")}</Label>
                  <Input
                    id="edit-preset-area"
                    value={editPresetForm.area}
                    onChange={(e) => setEditPresetForm(prev => ({ ...prev, area: e.target.value }))}
                    placeholder={t("例: 東京都渋谷区")}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-preset-problem">{t("主な悩み")}</Label>
                  <Input
                    id="edit-preset-problem"
                    value={editPresetForm.mainProblem}
                    onChange={(e) => setEditPresetForm(prev => ({ ...prev, mainProblem: e.target.value }))}
                    placeholder={t("例: 新規集客が難しい")}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-preset-strength">{t("強み")}</Label>
                  <Input
                    id="edit-preset-strength"
                    value={editPresetForm.strength}
                    onChange={(e) => setEditPresetForm(prev => ({ ...prev, strength: e.target.value }))}
                    placeholder={t("例: オーガニックカラー専門")}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-preset-proof">{t("実績・証拠")}</Label>
                  <Input
                    id="edit-preset-proof"
                    value={editPresetForm.proof}
                    onChange={(e) => setEditPresetForm(prev => ({ ...prev, proof: e.target.value }))}
                    placeholder={t("例: 口コミ評価4.8")}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPresetDialogOpen(false)}>
              {t("キャンセル")}
            </Button>
            <Button
              onClick={() => {
                if (!editPresetForm.name.trim()) {
                  toast.error(t("プリセット名を入力してください"));
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
              {t("更新")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Shown when the user lands on /ai-generate without a `?project=` param.
 *
 * Behaviour:
 *  - 0 projects → punt to /ai-project-create (chat/form first)
 *  - 1 project → auto-redirect into /ai-generate?project=<id> immediately
 *  - 2+ projects → show a quick picker so the user doesn't have to
 *                  re-fill the chat/form for an existing project
 *
 * Without this, sidebar "AI投稿生成" forced returning users back through
 * the project creation chat every single time, which they had to abandon
 * and dig their existing project out of /dashboard.
 */
function ProjectAutoPicker() {
  const { t } = useLang();
  const [, setLocation] = useLocation();
  const { data: projects, isLoading } = trpc.project.list.useQuery();

  // wouter's setLocation only listens to PATHNAME changes — going from
  // /ai-generate to /ai-generate?project=xxx is the same pathname, so the
  // page wouldn't re-mount and AIGenerate (which reads window.location.search
  // directly) wouldn't pick up the new project. Fall through to a real
  // browser navigation in that case.
  const goToProject = (projectId: string) => {
    // ★postType等のパラメータを引き継ぐ。
    //   ホームの「固定投稿をAIで作る」は /ai-generate?postType=pinned で来るため、
    //   ここで落とすと固定投稿モードが解除されてしまう（実際に発生していた）。
    const params = new URLSearchParams(window.location.search);
    params.set('project', projectId);
    window.location.href = `/ai-generate?${params.toString()}`;
  };

  // Auto-redirect for the single-project case so the user doesn't even
  // see this picker — the whole point is "just take me to AI generation".
  // ★複数「アカウント」運用のときだけ、切替中アカウントの既定店舗へ直行する（切替追随）。
  //   アカウント1つ×店舗2つの構成では従来どおりピッカーを出す
  //   （無条件リダイレクトだと既定でない店舗に手動生成できなくなるため）。
  const { selectedAccount: pickerAccount, accounts: pickerAccounts } = useThreadsAccount();
  useEffect(() => {
    if (!projects) return;
    const accountProjectId = pickerAccount?.defaultProjectId;
    if (pickerAccounts.length > 1 && accountProjectId && projects.some((p: any) => p.id === accountProjectId)) {
      goToProject(accountProjectId);
      return;
    }
    if (projects.length === 0) {
      setLocation('/ai-project-create');
    } else if (projects.length === 1) {
      goToProject(projects[0].id);
    }
  }, [projects, setLocation, pickerAccount?.defaultProjectId, pickerAccounts.length]);

  if (isLoading || !projects || projects.length <= 1) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-10 px-4">
      <h1 className="text-xl font-bold mb-2">{t("どのプロジェクトでAI投稿を作りますか？")}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t("過去に作ったプロジェクトを選ぶと、お店の情報を再入力せずにすぐAI生成に進めます。")}
      </p>

      <div className="space-y-2">
        {projects.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => goToProject(p.id)}
            className="w-full text-left rounded-lg border border-border bg-background p-4 hover:border-primary hover:bg-primary/5 transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground truncate">{p.title || '無題のプロジェクト'}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {[p.businessType, p.area].filter(Boolean).join(' ・ ') || '店舗情報未設定'}
                </p>
              </div>
              <ArrowLeft className="w-4 h-4 text-muted-foreground rotate-180 flex-shrink-0" />
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-border text-center">
        <Button
          variant="outline"
          onClick={() => setLocation('/ai-project-create')}
        >
          <Plus className="w-4 h-4 mr-2" />
          {t("新しいプロジェクトを作る")}
        </Button>
      </div>
    </div>
  );
}

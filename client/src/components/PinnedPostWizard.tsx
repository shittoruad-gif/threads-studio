/**
 * 固定投稿作成ウィザード（3ステップ）
 *
 * Step 1: URLを登録する
 *   - 登録済みURLを確認・追加できる
 *   - 未登録なら入力フォームを表示
 *
 * Step 2: 固定投稿を作成する
 *   - 登録URLをカード形式で表示し使用チャネルを選択
 *   - AI生成（3案）を実行
 *
 * Step 3: 投稿を選んで好みを学習する
 *   - 3案をプレビュー
 *   - 👍/👎フィードバック + 👎理由チップ
 *   - 好みを保存し次回生成に反映
 */

import { useState } from 'react';
import { useLang } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight, ArrowLeft, Sparkles, Loader2, ThumbsUp, ThumbsDown,
  Link as LinkIcon, Check, ExternalLink, AlertCircle, Plus, X,
  HelpCircle, ChevronDown,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
  type ProjectLink,
  type ProjectLinkType,
  LINK_TYPES,
  parseProjectLinks,
  normaliseDefaults,
} from '@shared/projectLinks';
import ThreadsPostPreview from '@/components/ThreadsPostPreview';

// ────────────────────────────────────────
// Types
// ────────────────────────────────────────

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

interface PostCandidate extends GeneratedPost {
  _idx: number;
}

type Feedback = 'like' | 'dislike' | null;

const DISLIKE_REASONS = [
  '文体が硬い',
  '文体がくだけすぎ',
  '長すぎる',
  '短すぎる',
  '絵文字が多すぎる',
  '絵文字がない',
  '内容がずれている',
  '自分らしくない',
  'CTAが不自然',
] as const;

type DislikeReason = typeof DISLIKE_REASONS[number];

const STEP_LABELS = ['URLを登録', '投稿を作成', '好みを学習'] as const;

// ────────────────────────────────────────
// URL取得方法ヘルプコンテンツ
// ────────────────────────────────────────

const URL_HELP: Partial<Record<ProjectLinkType, { title: string; steps: string[] }>> = {
  line: {
    title: '💬 LINE公式アカウントのURLを調べる方法',
    steps: [
      '① パソコンで https://manager.line.biz/ を開いてログインする',
      '② 左のメニューから「アカウント設定」→「基本情報」をクリック',
      '③「基本ID」（例: @abc12345）が表示されます',
      '④ 同じ管理画面で「友だち追加ガイド」を開き、「招待URL」をコピー',
      '⑤ コピーしたURL（例: https://lin.ee/xxxxx）をそのままここに貼り付けてください',
    ],
  },
  reservation: {
    title: '📅 Web予約ページのURLを調べる方法',
    steps: [
      '① ホットペッパービューティーなどの予約サービスにログインする',
      '②「自分の店舗ページを見る」や「お店のページ」ボタンをタップ/クリック',
      '③ 店舗ページが開いたら、画面上部の「アドレスバー」をタップ/クリック',
      '④ URLが選択されたら「コピー」を押してそのままここに貼り付けてください',
    ],
  },
  website: {
    title: '🌐 公式ホームページのURLを調べる方法',
    steps: [
      '① スマホまたはパソコンでホームページを開く',
      '② 画面上部の「アドレスバー」（URLが表示されている細長い欄）をタップ/クリック',
      '③ URLが青くハイライトされたら「コピー」を選ぶ',
      '④ そのままここに貼り付けてください',
    ],
  },
};

// ────────────────────────────────────────
// Helper
// ────────────────────────────────────────

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ────────────────────────────────────────
// Main component
// ────────────────────────────────────────

interface PinnedPostWizardProps {
  projectId: string;
  project: any; // trpc.project.get result (raw)
  onComplete: (post: GeneratedPost) => void;
  onCancel: () => void;
}

export default function PinnedPostWizard({
  projectId,
  project,
  onComplete,
  onCancel,
}: PinnedPostWizardProps) {
  const { t } = useLang();
  const utils = trpc.useUtils();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ── Step 1 state ──
  const [links, setLinks] = useState<ProjectLink[]>(() =>
    parseProjectLinks((project as any).links || null)
  );
  const [newLinkType, setNewLinkType] = useState<ProjectLinkType>('line');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [showAddForm, setShowAddForm] = useState(links.length === 0);
  const [isSavingLinks, setIsSavingLinks] = useState(false);
  const [showUrlHelp, setShowUrlHelp] = useState(false);

  // ── Step 2 state ──
  const [selectedLinkType, setSelectedLinkType] = useState<ProjectLinkType | null>(null);
  const [candidates, setCandidates] = useState<PostCandidate[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // ── Step 3 state ──
  const [feedbacks, setFeedbacks] = useState<Record<number, Feedback>>({});
  const [dislikeReasons, setDislikeReasons] = useState<Record<number, DislikeReason[]>>({});
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

  const setLinksMutation = trpc.project.setLinks.useMutation();
  const generateMutation = trpc.project.generatePost.useMutation();
  const saveFeedbackMutation = trpc.project.savePinnedPostFeedback.useMutation();

  // ────────────────────────────────────────
  // Step 1: URL registration
  // ────────────────────────────────────────

  const handleAddLink = () => {
    if (!newLinkUrl.trim()) { toast.error(t('URLを入力してください')); return; }
    try { new URL(newLinkUrl.trim()); } catch {
      toast.error(t('有効なURLを入力してください'));
      return;
    }
    const cfg = LINK_TYPES[newLinkType];
    const updated = normaliseDefaults([
      ...links,
      {
        id: genId(),
        type: newLinkType,
        label: cfg.name,
        url: newLinkUrl.trim(),
        isDefault: !links.some(l => l.type === newLinkType),
      },
    ]);
    setLinks(updated);
    setNewLinkUrl('');
    setShowAddForm(false);
  };

  const handleRemoveLink = (id: string) => {
    setLinks(prev => normaliseDefaults(prev.filter(l => l.id !== id)));
  };

  const handleSaveLinksAndNext = async () => {
    if (links.length === 0) {
      // URLなしでも続行可（プロジェクト設定で後から追加できる）
      setStep(2);
      return;
    }
    setIsSavingLinks(true);
    try {
      await setLinksMutation.mutateAsync({ projectId, links });
      utils.project.get.invalidate({ id: projectId });
      toast.success(t('URLを保存しました'));
      setStep(2);
    } catch (e: any) {
      toast.error(e.message || t('保存できませんでした'));
    } finally {
      setIsSavingLinks(false);
    }
  };

  // ────────────────────────────────────────
  // Step 2: Generate posts
  // ────────────────────────────────────────

  // Determine effective preferred link type
  const effectiveLinkType: ProjectLinkType | null = (() => {
    if (selectedLinkType && links.some(l => l.type === selectedLinkType)) return selectedLinkType;
    // Auto-select: LINE > reservation > website > first
    const order: ProjectLinkType[] = ['line', 'reservation', 'website', 'instagram', 'youtube', 'other'];
    for (const t of order) {
      if (links.some(l => l.type === t)) return t;
    }
    return null;
  })();

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setCandidates(null);
    try {
      const results = await Promise.all(
        [0, 1, 2].map(idx =>
          generateMutation
            .mutateAsync({
              projectId,
              postType: 'pinned',
              treeCount: 0,
              preferredLinkType: effectiveLinkType ?? undefined,
            })
            .then(d => ({ ...(d as GeneratedPost), _idx: idx }))
            .catch(() => null)
        )
      );
      const ok = results.filter(Boolean) as PostCandidate[];
      if (ok.length === 0) throw new Error(t('AI生成に失敗しました'));
      utils.subscription.getAiUsage.invalidate();
      setCandidates(ok);
      setStep(3);
    } catch (e: any) {
      toast.error(e.message || t('AI生成に失敗しました。時間をおいて再度お試しください。'));
    } finally {
      setIsGenerating(false);
    }
  };

  // ────────────────────────────────────────
  // Step 3: Feedback & select
  // ────────────────────────────────────────

  const toggleFeedback = (idx: number, val: Feedback) => {
    setFeedbacks(prev => ({ ...prev, [idx]: prev[idx] === val ? null : val }));
    // thumbs up → clear dislike reasons
    if (val === 'like') setDislikeReasons(prev => ({ ...prev, [idx]: [] }));
  };

  const toggleReason = (idx: number, reason: DislikeReason) => {
    setDislikeReasons(prev => {
      const cur = prev[idx] ?? [];
      return {
        ...prev,
        [idx]: cur.includes(reason) ? cur.filter(r => r !== reason) : [...cur, reason],
      };
    });
  };

  const handleComplete = async () => {
    if (selectedIdx === null || !candidates) return;

    // Collect all dislike reasons from 👎'd posts
    const allDislikes = Object.entries(feedbacks)
      .filter(([, fb]) => fb === 'dislike')
      .flatMap(([idx]) => dislikeReasons[Number(idx)] ?? []);
    const uniqueDislikes = Array.from(new Set(allDislikes));

    setIsSavingFeedback(true);
    try {
      if (uniqueDislikes.length > 0) {
        await saveFeedbackMutation.mutateAsync({
          projectId,
          dislikes: uniqueDislikes,
        });
      }
      const selected = candidates[selectedIdx];
      onComplete(selected);
    } catch (e: any) {
      toast.error(e.message || t('保存に失敗しました'));
    } finally {
      setIsSavingFeedback(false);
    }
  };

  // ────────────────────────────────────────
  // Render helpers
  // ────────────────────────────────────────

  const StepIndicator = () => (
    <div className="flex items-center gap-1 mb-6">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div key={n} className="flex items-center">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              active ? 'bg-amber-500 text-white' :
              done ? 'bg-amber-100 text-amber-700' :
              'bg-muted text-muted-foreground'
            }`}>
              {done ? <Check className="w-3 h-3" /> : <span>{n}</span>}
              {t(label)}
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`h-px w-4 mx-1 ${step > n ? 'bg-amber-300' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  // ────────────────────────────────────────
  // Step 1 UI
  // ────────────────────────────────────────

  if (step === 1) {
    return (
      <div className="space-y-4">
        <StepIndicator />
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-emerald-600" />
            {t("URLを登録する")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("LINE・予約ページなどのURLを共有するだけでOK。固定投稿のCTAで自動的に使われます。")}
          </p>
        </div>

        {/* 登録済みリスト */}
        {links.length > 0 && (
          <div className="space-y-2">
            {links.map(link => {
              const cfg = LINK_TYPES[link.type];
              return (
                <div key={link.id} className="flex items-center gap-2 rounded-lg border bg-background/50 px-3 py-2.5">
                  <span className="text-xl">{cfg.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm">{link.label}</span>
                      {link.isDefault && (
                        <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 px-1.5 py-0">
                          {t("既定")}
                        </Badge>
                      )}
                    </div>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1 truncate"
                    >
                      {link.url}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveLink(link.id)}
                    className="text-muted-foreground hover:text-red-500 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 追加フォーム */}
        {showAddForm ? (
          <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/10 p-4 space-y-3">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{t("URLを追加")}</p>
            {/* タイプ選択 */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {(['line', 'reservation', 'website', 'instagram', 'youtube', 'other'] as ProjectLinkType[]).map(type => {
                const cfg = LINK_TYPES[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { setNewLinkType(type); setShowUrlHelp(false); }}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors ${
                      newLinkType === type
                        ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 font-semibold'
                        : 'border-border hover:border-emerald-300'
                    }`}
                  >
                    <span className="text-lg">{cfg.emoji}</span>
                    <span className="truncate w-full text-center">{t(cfg.name)}</span>
                  </button>
                );
              })}
            </div>
            <Input
              placeholder={LINK_TYPES[newLinkType].hint}
              value={newLinkUrl}
              onChange={e => setNewLinkUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddLink()}
            />

            {/* URLの取得方法ヘルプ（アコーディオン） */}
            {URL_HELP[newLinkType] && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowUrlHelp(v => !v)}
                  className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 py-1 transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                  ？ URLの取得方法がわからない場合
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showUrlHelp ? 'rotate-180' : ''}`} />
                </button>
                {showUrlHelp && (
                  <div className="mt-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 space-y-2">
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      {URL_HELP[newLinkType]!.title}
                    </p>
                    <ol className="space-y-2">
                      {URL_HELP[newLinkType]!.steps.map((step, i) => (
                        <li key={i} className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddLink} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="w-4 h-4 mr-1" />
                {t("追加")}
              </Button>
              {links.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
                  {t("キャンセル")}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm text-muted-foreground hover:border-emerald-400 hover:text-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("URLを追加")}
          </button>
        )}

        {links.length === 0 && !showAddForm && (
          <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {t("URLを登録しておくと、固定投稿でLINEや予約ページへの誘導文が自動で入ります。")}
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("キャンセル")}
          </Button>
          <Button
            size="sm"
            onClick={handleSaveLinksAndNext}
            disabled={isSavingLinks}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {isSavingLinks ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-1" />}
            {links.length === 0 ? t("URLなしで次へ") : t("保存して次へ")}
          </Button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────
  // Step 2 UI
  // ────────────────────────────────────────

  if (step === 2) {
    return (
      <div className="space-y-4">
        <StepIndicator />
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            {t("固定投稿を作成する")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("使用するURLを確認して「AI生成」を押してください。3案を生成して選べます。")}
          </p>
        </div>

        {/* URL選択 */}
        {links.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("使用するURL")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {links.map(link => {
                const cfg = LINK_TYPES[link.type];
                const isEffective = effectiveLinkType === link.type;
                const isChosen = selectedLinkType === link.type;
                const isActive = isChosen || (!selectedLinkType && isEffective);
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => setSelectedLinkType(
                      selectedLinkType === link.type ? null : link.type
                    )}
                    className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                      isActive
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30'
                        : 'border-border hover:border-amber-200'
                    }`}
                  >
                    <span className="text-2xl">{cfg.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm">{link.label}</span>
                        {cfg.preferForCv && !selectedLinkType && isEffective && (
                          <Badge className="text-xs bg-amber-500 text-white px-1.5 py-0 border-0">
                            {t("おすすめ")}
                          </Badge>
                        )}
                        {isActive && (
                          <span className="ml-auto">
                            <Check className="w-4 h-4 text-amber-500" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("※ 投稿本文にURLは貼られません。「プロフィールのリンクから」という間接誘導になります。")}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {t("URLが未登録です。URLなしで固定投稿を生成します（後からURL登録してください）。")}
          </div>
        )}

        {/* Generate button */}
        <Button
          className="w-full bg-amber-500 hover:bg-amber-600 text-white h-12 text-base font-semibold"
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {t("AI生成中（3案）...")}
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              {t("AI投稿を生成（3案）")}
            </>
          )}
        </Button>

        <div className="flex justify-start">
          <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            {t("戻る")}
          </Button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────
  // Step 3 UI
  // ────────────────────────────────────────

  if (step === 3 && candidates) {
    const canComplete = selectedIdx !== null;

    return (
      <div className="space-y-6">
        <StepIndicator />
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ThumbsUp className="w-5 h-5 text-blue-500" />
            {t("投稿を選んで好みを学習する")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("気に入った投稿を選んでください。👍/👎のフィードバックは次回生成に反映されます。")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {candidates.map((post, idx) => {
            const fb = feedbacks[idx] ?? null;
            const reasons = dislikeReasons[idx] ?? [];
            const isSelected = selectedIdx === idx;

            return (
              <div
                key={idx}
                className={`rounded-xl border-2 transition-all flex flex-col ${
                  isSelected
                    ? 'border-amber-400 shadow-lg shadow-amber-100 dark:shadow-amber-950/20'
                    : 'border-border'
                }`}
              >
                {/* Post preview */}
                <div className="flex-1 p-3 rounded-t-xl overflow-hidden">
                  <div className="text-xs text-muted-foreground mb-2 font-semibold">
                    {t("案")} {idx + 1}
                  </div>
                  <div className="bg-background rounded-lg overflow-y-auto max-h-60">
                    <div className="p-3 text-sm whitespace-pre-wrap text-foreground leading-relaxed">
                      {post.mainPost}
                      {post.cta && (
                        <span className="block mt-3 text-muted-foreground text-xs border-t pt-2">
                          {post.cta}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Feedback bar */}
                <div className="px-3 pb-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleFeedback(idx, 'like')}
                      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors border ${
                        fb === 'like'
                          ? 'bg-emerald-100 border-emerald-400 text-emerald-700'
                          : 'border-border text-muted-foreground hover:bg-emerald-50 hover:border-emerald-300'
                      }`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      {t("好み")}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFeedback(idx, 'dislike')}
                      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors border ${
                        fb === 'dislike'
                          ? 'bg-red-100 border-red-400 text-red-700'
                          : 'border-border text-muted-foreground hover:bg-red-50 hover:border-red-300'
                      }`}
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      {t("好みでない")}
                    </button>
                  </div>

                  {/* Dislike reason chips */}
                  {fb === 'dislike' && (
                    <div className="flex flex-wrap gap-1.5">
                      {DISLIKE_REASONS.map(reason => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => toggleReason(idx, reason)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            reasons.includes(reason)
                              ? 'bg-red-100 border-red-400 text-red-700 font-semibold'
                              : 'border-border text-muted-foreground hover:border-red-300'
                          }`}
                        >
                          {t(reason)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Select button */}
                <div className="px-3 pb-3">
                  <Button
                    size="sm"
                    className={`w-full ${
                      isSelected
                        ? 'bg-amber-500 hover:bg-amber-600 text-white'
                        : 'variant-outline'
                    }`}
                    variant={isSelected ? 'default' : 'outline'}
                    onClick={() => setSelectedIdx(isSelected ? null : idx)}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        {t("この投稿を使う（選択中）")}
                      </>
                    ) : (
                      t("この投稿を使う")
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-between items-center pt-2">
          <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            {t("生成しなおす")}
          </Button>
          <Button
            onClick={handleComplete}
            disabled={!canComplete || isSavingFeedback}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {isSavingFeedback ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            {t("好みを保存して編集画面へ")}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

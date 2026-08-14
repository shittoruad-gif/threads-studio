import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'wouter';
import { nanoid } from 'nanoid';
import {
  ArrowLeft, ArrowRight, Sparkles, Loader2, Check,
  PartyPopper, Plus, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import ProjectLinksManager from '@/components/ProjectLinksManager';
import {
  COUNSELING_QUESTIONS,
  type CounselingAnswers,
  type CounselingQuestion,
} from '../../../shared/counseling';

/** レビュー画面で使う、各設問の短いラベル */
const QUESTION_LABELS: Record<string, string> = {
  brandVoiceRaw: '口調・話し方',
  uspRaw: '選ばれる理由（USP）',
  menuRaw: '主なメニュー・コース',
  hoursInfoRaw: '営業時間・定休日・予約方法',
  realProofsRaw: '実績の数字',
  realEpisodesRaw: 'お客様のエピソード',
  benefitsDailyRaw: '来店後の変化',
  ctaAssetsRaw: '特典・無料オファー',
  faqRaw: 'よくある質問',
  industryMythsRaw: '業界の常識・失敗',
  originStoryRaw: '原体験・想い',
  ngListRaw: '絶対NG項目',
  preferredTypesRaw: 'よく作りたい投稿タイプ',
  useThreadsKnowhow: 'Threadsノウハウの使用',
};

/** 回答を人が読める表示に整形（選択肢はラベルに変換） */
function formatAnswerForReview(q: CounselingQuestion, value: string): string {
  const raw = (value ?? '').trim();
  if (!raw) return '（未入力）';
  if (q.choices && (q.ui === 'choice' || q.ui === 'multi-choice')) {
    const vals = raw.split(/[,\s]+/).filter(Boolean);
    const labels = vals.map((v) => q.choices!.find((c) => c.value === v)?.label || v);
    return labels.join(' / ') || '（未入力）';
  }
  return raw;
}

/**
 * AIカウンセリング画面
 *
 * URL: /ai-counseling?project=<projectId>
 *
 * 設計：
 *  - 1問ずつ表示（チャット風の進行）
 *  - 選択肢チップ・例文・「なし」ショートカットで答えやすく
 *  - 全問終わったら projectt.saveCounseling で一括保存
 */
// ── 入力途中の自動下書き ─────────────────────────────────────────
// カウンセリングは完了時に初めてサーバー保存されるため、途中でリロードや
// エラーが起きると入力が全て消えていた（2026-08-14 柿本さんで実際に発生・
// 復元不能だった）。入力のたびにlocalStorageへ保存し、次回訪問時に復元する。
const COUNSELING_DRAFT_KEY = 'counseling-draft-v1';
type CounselingDraft = {
  projectId: string;
  answers: Partial<CounselingAnswers>;
  stepIndex: number;
  savedAt: number;
};
function loadCounselingDraft(): CounselingDraft | null {
  try {
    const raw = localStorage.getItem(COUNSELING_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as CounselingDraft;
    if (!d?.projectId || !d?.answers) return null;
    // 7日より古い下書きは使わない
    if (Date.now() - (d.savedAt ?? 0) > 7 * 24 * 60 * 60 * 1000) return null;
    // 中身が空なら無視
    if (!Object.values(d.answers).some((v) => v && String(v).trim())) return null;
    return d;
  } catch {
    return null;
  }
}

export default function AICounseling() {
  const [, setLocation] = useLocation();
  // ?project= があれば既存プロジェクトの修正。無ければ新規（IDを発行し、保存時に作成）。
  const isNew = useMemo(() => !new URL(window.location.href).searchParams.get('project'), []);
  // 新規のときだけ下書きを見る（既存プロジェクトの修正はサーバー保存値が正）
  const draft = useMemo(() => (isNew ? loadCounselingDraft() : null), [isNew]);
  const projectId = useMemo(() => {
    const url = new URL(window.location.href);
    return url.searchParams.get('project') || draft?.projectId || nanoid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [stepIndex, setStepIndex] = useState(() =>
    draft ? Math.min(draft.stepIndex ?? 0, COUNSELING_QUESTIONS.length - 1) : 0
  );
  const [answers, setAnswers] = useState<Partial<CounselingAnswers>>(draft?.answers ?? {});

  // /ai-counseling を引数なしで開いたが既にプロジェクトがある場合は、
  // 真っ白な新規入力ではなく既存の回答を開く（「入力が消えた」ように見える誤解の防止。
  // 2026-08-14 滝本さんで実際に発生）。新店舗の追加は /ai-project-create 経由なので影響しない。
  const { data: existingProjects } = trpc.project.list.useQuery(undefined, { enabled: isNew });
  useEffect(() => {
    if (!isNew || window.location.pathname !== '/ai-counseling') return;
    if (existingProjects && existingProjects.length > 0) {
      window.location.replace(`/ai-counseling?project=${existingProjects[0].id}`);
    }
  }, [existingProjects, isNew]);
  // /ai-project-create（新店舗の追加）に既存ユーザーが迷い込んだ場合の案内。
  // 空の入力欄を見て「保存した内容が消えた」と誤解されるのを防ぐ。
  const strayedIntoCreate =
    isNew && window.location.pathname === '/ai-project-create' &&
    !!existingProjects && existingProjects.length > 0;

  // 下書きから復元したことを一度だけ知らせる
  useEffect(() => {
    if (draft) toast.info('前回の入力途中の内容を復元しました（続きから進められます）');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 入力のたびに自動保存（新規カウンセリングのみ）
  useEffect(() => {
    if (!isNew) return;
    if (!Object.values(answers).some((v) => v && String(v).trim())) return;
    try {
      localStorage.setItem(
        COUNSELING_DRAFT_KEY,
        JSON.stringify({ projectId, answers, stepIndex, savedAt: Date.now() } satisfies CounselingDraft)
      );
    } catch { /* 容量超過等は無視（保存できないだけ） */ }
  }, [answers, stepIndex, isNew, projectId]);
  // 'questions' = 1問ずつ回答 / 'review' = 全回答の一覧（修正可）
  const [view, setView] = useState<'questions' | 'review'>('questions');
  // レビューから1問だけ修正中か（修正後はレビューへ戻す）
  const [editingOne, setEditingOne] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const utils = trpc.useUtils();

  const { data: project } = trpc.project.get.useQuery(
    { id: projectId },
    { enabled: !!projectId && !isNew },
  );

  // 既存のカウンセリング結果を取得して、回答欄に事前入力する（＝あとから修正できる）。
  const { data: counselingData, isLoading: counselingLoading } =
    trpc.project.getCounseling.useQuery(
      { projectId },
      { enabled: !!projectId && !isNew },
    );

  // 取得できたら一度だけ回答に流し込む。既にカウンセリング済みならレビュー画面から開始。
  useEffect(() => {
    if (hydrated || counselingLoading) return;
    const result = counselingData?.result as any;
    if (result && result.rawAnswers && Object.keys(result.rawAnswers).length > 0) {
      setAnswers(result.rawAnswers as Partial<CounselingAnswers>);
      setView('review');
    }
    setHydrated(true);
  }, [counselingData, counselingLoading, hydrated]);

  const saveMutation = trpc.project.saveCounseling.useMutation({
    onSuccess: () => {
      // バナーが残らないように getCounseling と project.get の両方を invalidate。
      utils.project.getCounseling.invalidate({ projectId });
      utils.project.get.invalidate({ id: projectId });
      utils.project.count.invalidate();
      utils.project.list.invalidate();
      // 保存が完了したので下書きは消す
      try { localStorage.removeItem(COUNSELING_DRAFT_KEY); } catch { /* ignore */ }
      toast.success(isNew ? 'お店の情報を登録しました' : 'カウンセリング結果を保存しました');
      // 初回はスタイル校正へ誘導。修正（既にカウンセリング済み）の場合は生成画面へ戻す。
      if (counselingData?.counseledAt) {
        setLocation(`/ai-generate?project=${projectId}`);
      } else {
        setLocation(`/ai-style-calibration?project=${projectId}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  if (!projectId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-muted-foreground">プロジェクトが指定されていません。</p>
            <Button onClick={() => setLocation('/ai-generate')}>AI投稿生成へ戻る</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalSteps = COUNSELING_QUESTIONS.length;
  const isLast = stepIndex === totalSteps - 1;
  const isFirst = stepIndex === 0;
  const currentQuestion = COUNSELING_QUESTIONS[stepIndex];
  const currentAnswer = answers[currentQuestion.id] ?? '';

  const setAnswer = (id: keyof CounselingAnswers, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const buildAnswersPayload = (merged: Partial<CounselingAnswers>) => ({
    storeNameRaw: merged.storeNameRaw ?? '',
    businessTypeRaw: merged.businessTypeRaw ?? '',
    areaRaw: merged.areaRaw ?? '',
    targetRaw: merged.targetRaw ?? '',
    mainProblemRaw: merged.mainProblemRaw ?? '',
    strengthRaw: merged.strengthRaw ?? '',
    brandVoiceRaw: merged.brandVoiceRaw ?? '',
    uspRaw: merged.uspRaw ?? '',
    menuRaw: merged.menuRaw ?? '',
    hoursInfoRaw: merged.hoursInfoRaw ?? '',
    realProofsRaw: merged.realProofsRaw ?? '',
    realEpisodesRaw: merged.realEpisodesRaw ?? '',
    benefitsDailyRaw: merged.benefitsDailyRaw ?? '',
    ctaAssetsRaw: merged.ctaAssetsRaw ?? '',
    faqRaw: merged.faqRaw ?? '',
    industryMythsRaw: merged.industryMythsRaw ?? '',
    originStoryRaw: merged.originStoryRaw ?? '',
    ngListRaw: merged.ngListRaw ?? '',
    preferredTypesRaw: merged.preferredTypesRaw ?? '',
    useThreadsKnowhow: (merged.useThreadsKnowhow as 'on' | 'off') ?? 'on',
  });

  const handleSave = () => {
    saveMutation.mutate({ projectId, answers: buildAnswersPayload(answers) });
  };

  // canProceed は現在のレンダーで描画されるボタンの enable/disable 用。
  // 実際の進行判定は handleNext 内でも独立に行うこと（state更新タイミングの
  // 競合を避けるため）。
  const canProceed = (() => {
    if (!currentQuestion.required) return true;
    const v = (currentAnswer as string)?.trim?.() ?? currentAnswer;
    return Boolean(v && (v as string).length > 0);
  })();

  /**
   * 次へ進む。
   * @param overrideAnswers - 直前に setAnswer した値を React state 反映を
   *   待たずに反映するためのオーバーライド。handleSkipEmpty から渡される。
   */
  const advance = (overrideAnswers?: Partial<CounselingAnswers>) => {
    const merged: Partial<CounselingAnswers> = { ...answers, ...(overrideAnswers ?? {}) };
    // 進行可否を最新の回答で再判定（race condition 防止）
    if (currentQuestion.required) {
      const raw = merged[currentQuestion.id];
      const v = typeof raw === 'string' ? raw.trim() : raw;
      if (!v || (v as string).length === 0) return;
    }

    // レビューから1問だけ修正していた場合は、修正を反映してレビューへ戻る。
    if (editingOne) {
      setEditingOne(false);
      setView('review');
      return;
    }

    if (isLast) {
      // 最後まで来たら、保存前に「内容の確認・修正」画面へ。
      setView('review');
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const handleNext = () => advance();

  const handleBack = () => {
    if (editingOne) {
      // 修正中はレビューへ戻る（変更は保持）。
      setEditingOne(false);
      setView('review');
      return;
    }
    if (!isFirst) setStepIndex((i) => i - 1);
  };

  const handleSkipEmpty = () => {
    // setAnswer の state 反映を待たずに、その値で advance する。
    // setTimeout だと canProceed が古い値で評価される race を避けるため。
    setAnswer(currentQuestion.id, 'なし');
    advance({ [currentQuestion.id]: 'なし' } as Partial<CounselingAnswers>);
  };

  /** レビューから特定の設問だけ修正する */
  const editQuestion = (index: number) => {
    setStepIndex(index);
    setEditingOne(true);
    setView('questions');
  };

  // 取得中はローディング（事前入力の有無を確定させてから描画）
  if (counselingLoading && !hydrated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-6 px-4 space-y-4">
      {/* 既存ユーザーが「新店舗追加」画面に迷い込んだときの案内（入力が消えたと誤解させない） */}
      {strayedIntoCreate && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">ここは「新しい店舗を追加する」画面です</p>
          <p className="mt-1 text-sm text-amber-800 leading-relaxed">
            保存済みのお店の情報は消えていません。登録済みの内容を確認・修正する場合は、下のボタンからどうぞ。
          </p>
          <Button
            size="sm"
            className="mt-3 w-full sm:w-auto bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => { window.location.href = `/ai-counseling?project=${existingProjects![0].id}`; }}
          >
            保存済みのお店の情報をひらく
          </Button>
        </div>
      )}
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation(isNew ? '/dashboard' : `/ai-generate?project=${projectId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          戻る
        </Button>
        <Badge variant="secondary" className="gap-1">
          <Sparkles className="h-3 w-3" />
          AIカウンセリング
        </Badge>
      </div>

      {/* タイトル */}
      <div>
        <h1 className="text-xl font-bold">
          {isNew ? 'はじめの設定（AIカウンセリング）' : `${project?.title || 'プロジェクト'} のAIカウンセリング`}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isNew
            ? 'いくつかの質問に答えるだけで、お店の情報が登録され、すぐに投稿を作れるようになります。答えた内容だけをAIは「事実」として使います。'
            : 'ここで答えてもらった内容だけをAIは「事実」として使います。書かれていない数字・エピソードを勝手に作ることはありません。'}
        </p>
      </div>

      {view === 'review' ? (
        /* ───────── 確認・修正画面 ───────── */
        <>
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <p className="text-sm font-medium text-emerald-800">入力内容の確認・修正</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              間違いがあれば各項目の「修正」から直せます。問題なければ下の「保存する」を押してください。
            </p>
          </div>

          <div className="space-y-2">
            {COUNSELING_QUESTIONS.map((q, i) => {
              const display = formatAnswerForReview(q, (answers[q.id] as string) ?? '');
              const isEmpty = display === '（未入力）';
              return (
                <Card key={q.id}>
                  <CardContent className="py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {QUESTION_LABELS[q.id] || `質問${i + 1}`}
                        {q.required && <span className="text-destructive ml-1">*</span>}
                      </p>
                      <p className={cn(
                        'text-sm mt-0.5 whitespace-pre-line break-words',
                        isEmpty ? 'text-muted-foreground/60 italic' : 'text-foreground',
                      )}>
                        {display}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      aria-label={`${QUESTION_LABELS[q.id] || '項目'}を修正`}
                      onClick={() => editQuestion(i)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      修正
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* 予約・LINE・HP などの誘導先URL（ここでもまとめて修正できる） */}
          {!isNew && projectId && project && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground px-1">
                予約・LINE・ホームページのリンク
              </p>
              <ProjectLinksManager
                projectId={projectId}
                initialLinksJson={(project as any).links || null}
                onSaved={() => utils.project.get.invalidate({ id: projectId })}
              />
            </div>
          )}

          <div className="flex items-center gap-2 sticky bottom-2 z-40 bg-background/95 backdrop-blur-sm py-2 -mx-4 px-4 rounded-t-lg">
            <Button
              variant="outline"
              onClick={() => { setEditingOne(false); setStepIndex(0); setView('questions'); }}
            >
              最初から見直す
            </Button>
            <div className="flex-1" />
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <PartyPopper className="h-4 w-4 mr-1" />
                  保存する
                </>
              )}
            </Button>
          </div>
        </>
      ) : (
        /* ───────── 1問ずつの回答画面 ───────── */
        <>
          {/* 進捗（単発修正中は非表示） */}
          {!editingOne && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>質問 {stepIndex + 1} / {totalSteps}</span>
                <span>{Math.round(((stepIndex + 1) / totalSteps) * 100)}%</span>
              </div>
              <Progress value={((stepIndex + 1) / totalSteps) * 100} className="h-1.5" />
            </div>
          )}
          {editingOne && (
            <p className="text-xs text-muted-foreground">
              この項目を修正しています。変更後「変更を反映」を押すと一覧に戻ります。
            </p>
          )}

          {/* 質問本体 */}
          <QuestionCard
            question={currentQuestion}
            value={(currentAnswer as string) ?? ''}
            onChange={(v) => setAnswer(currentQuestion.id, v)}
          />

          {/* ナビ */}
          <div className="flex items-center gap-2 sticky bottom-2 z-40 bg-background/95 backdrop-blur-sm py-2 -mx-4 px-4 rounded-t-lg">
            <Button variant="outline" disabled={!editingOne && isFirst} onClick={handleBack}>
              {editingOne ? '一覧に戻る' : '戻る'}
            </Button>
            <div className="flex-1" />
            {currentQuestion.allowEmptyShortcut && (
              <Button variant="ghost" onClick={handleSkipEmpty}>
                「なし」{editingOne ? 'にする' : 'で進む'}
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canProceed || saveMutation.isPending}
            >
              {editingOne ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  変更を反映
                </>
              ) : isLast ? (
                <>
                  内容を確認する
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              ) : (
                <>
                  次へ
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 1問ぶんの入力カード
// ─────────────────────────────────────────────────────────────────────────
function QuestionCard({
  question,
  value,
  onChange,
}: {
  question: CounselingQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  // multi-choice 用に値をパース
  const selectedValues = useMemo(
    () => value.split(/[,\s]+/).filter(Boolean),
    [value],
  );

  const toggleMultiChoice = (v: string) => {
    const set = new Set(selectedValues);
    if (set.has(v)) set.delete(v); else set.add(v);
    onChange(Array.from(set).join(','));
  };

  const insertSuggestion = (s: string) => {
    if (!value || value.trim() === '') {
      onChange(s);
    } else {
      // 既に同じものが入っていたら無視
      const lines = value.split('\n').map((l) => l.trim());
      if (lines.includes(s.trim())) return;
      onChange((value.endsWith('\n') ? value : value + '\n') + s);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="text-sm whitespace-pre-line leading-relaxed">
          {question.prompt}
        </div>
        {question.helper && (
          <p className="text-xs text-muted-foreground">{question.helper}</p>
        )}

        {/* 例文 */}
        {question.examples && question.examples.length > 0 && (
          <div className="bg-muted/50 rounded-md p-3 space-y-1 border-l-2 border-primary/40">
            {question.examples.map((ex, i) => (
              <p key={i} className="text-xs text-muted-foreground leading-relaxed">{ex}</p>
            ))}
          </div>
        )}

        {/* choice */}
        {question.ui === 'choice' && question.choices && (
          <div className="grid gap-2">
            {question.choices.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => onChange(c.value)}
                className={cn(
                  'text-left rounded-lg border p-4 transition-all',
                  'hover:bg-accent/50',
                  value === c.value
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                    : 'border-border',
                )}
              >
                <div className="flex items-start gap-2">
                  <div className={cn(
                    'h-4 w-4 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                    value === c.value ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                  )}>
                    {value === c.value && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{c.label}</div>
                    {c.description && (
                      <div className="text-xs text-muted-foreground mt-1">{c.description}</div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* multi-choice */}
        {question.ui === 'multi-choice' && question.choices && (
          <div className="grid gap-2 sm:grid-cols-2">
            {question.choices.map((c) => {
              const isSelected = selectedValues.includes(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggleMultiChoice(c.value)}
                  className={cn(
                    'text-left rounded-lg border p-3 transition-all',
                    'hover:bg-accent/50',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn(
                      'h-4 w-4 mt-0.5 rounded border-2 flex-shrink-0 flex items-center justify-center',
                      isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                    )}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm leading-tight">{c.label}</div>
                      {c.description && (
                        <div className="text-xs text-muted-foreground mt-1">{c.description}</div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* textarea / multiline-list */}
        {(question.ui === 'textarea' || question.ui === 'multiline-list') && (
          <>
            {question.suggestions && question.suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {question.suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => insertSuggestion(s)}
                    className="text-xs bg-secondary hover:bg-secondary/80 rounded-full px-3 py-1 inline-flex items-center gap-1 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    {s}
                  </button>
                ))}
              </div>
            )}
            <Textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              rows={question.ui === 'multiline-list' ? 6 : 4}
              placeholder={
                question.ui === 'multiline-list'
                  ? '上のチップをタップで挿入できます。1行に1つずつ書いてください。'
                  : '上のチップから選ぶか、自由に書いてください。'
              }
              className="resize-none"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

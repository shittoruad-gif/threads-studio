import { useState } from 'react';
import { useLang } from '@/i18n';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Link2, MessageCircleQuestion, Zap, CalendarCheck, X, ArrowRight } from 'lucide-react';

/**
 * 初心者向けの「次にやること」チェックリスト（ダッシュボード最上部に常設）。
 *
 * 旧「はじめましょう」カードは3枚並列で順序が伝わらず、しかもThreads連携が
 * 済むと丸ごと消えるため「次に何をすればいいか分からない」という声が出た
 * （2026-08-14 滝本さん）。ここでは実データから進捗を判定し、
 * 「今やるべき1ステップだけ」を大きなボタンで示す。
 * 全ステップ完了後はコンパクトな完了カードになり、×で閉じられる。
 */

const DISMISS_KEY = 'setup-checklist-dismissed';

interface Props {
  threadsConnected: boolean;
  hasProject: boolean;
  autoPostOn: boolean;
  onNavigate: (path: string) => void;
  onEnableAutoPost: () => void;
  enablingAutoPost?: boolean;
}

export default function SetupChecklist({
  threadsConnected,
  hasProject,
  autoPostOn,
  onNavigate,
  onEnableAutoPost,
  enablingAutoPost,
}: Props) {
  const { t } = useLang();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1'
  );

  const steps = [
    {
      done: threadsConnected,
      icon: Link2,
      title: t('Threadsと連携する'),
      desc: t('お店のThreadsアカウントをこのアプリにつなぎます。'),
      cta: t('連携画面を開く'),
      action: () => onNavigate('/threads-connect'),
    },
    {
      done: hasProject,
      icon: MessageCircleQuestion,
      title: t('発信の目的を選んで、AIに教える'),
      desc: t('最初に「お店の集客」か「個人にファンをつける」かを選び、質問に答えるだけです（10〜15分）。答えた内容だけを使って投稿が作られます。'),
      cta: t('入力を始める'),
      action: () => onNavigate('/ai-counseling'),
    },
    {
      done: autoPostOn,
      icon: Zap,
      title: t('自動投稿をONにする'),
      desc: t('ONにすると、毎日おすすめの時間帯にAIが自動で投稿します。'),
      cta: t('ONにする'),
      action: onEnableAutoPost,
      pending: enablingAutoPost,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  // 「今やるべき」＝未完了のうち一番上のステップ
  const currentIndex = steps.findIndex((s) => !s.done);

  // ── 全部完了：コンパクトな完了カード（×で以後非表示）──
  if (allDone) {
    if (dismissed) return null;
    return (
      <div className="mb-6 rounded-xl border-2 border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <CalendarCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-foreground">{t('初期設定はすべて完了しています')}</p>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              {t('あとは自動投稿におまかせください。投稿の内容や予定は「投稿予定・履歴」でいつでも確認できます。')}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400"
              onClick={() => onNavigate('/post-history')}
            >
              {t('投稿予定を確認する')}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
          <button
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => {
              localStorage.setItem(DISMISS_KEY, '1');
              setDismissed(true);
            }}
            aria-label={t('閉じる')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── 未完了あり：順番付きチェックリスト ──
  return (
    <div className="mb-6 rounded-xl border-2 border-emerald-300 bg-white dark:bg-card p-4 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-foreground">{t('はじめての設定')}</h2>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
          {doneCount} / {steps.length}
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('Threads Studioは、AIがあなたの代わりに毎日Threadsへ投稿するサービスです。上から順番に進めるだけで、毎日の自動投稿が始まります。')}
      </p>

      <div className="space-y-2.5">
        {steps.map((step, i) => {
          const isCurrent = i === currentIndex;
          const Icon = step.icon;
          return (
            <div
              key={step.title}
              className={
                isCurrent
                  ? 'rounded-lg border-2 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 p-4'
                  : 'rounded-lg border border-border p-4 ' + (step.done ? '' : 'opacity-55')
              }
            >
              <div className="flex items-start gap-3">
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-500" />
                ) : (
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isCurrent ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {i + 1}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold ${step.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                    <Icon className="mr-1.5 inline h-4 w-4 align-[-2px]" />
                    {step.title}
                  </p>
                  {isCurrent && (
                    <>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                      <Button
                        className="mt-3 w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
                        onClick={step.action}
                        disabled={step.pending}
                      >
                        {step.pending ? t('設定中...') : step.cta}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

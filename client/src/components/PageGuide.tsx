import { useState } from 'react';
import { useLocation } from 'wouter';
import { useLang } from '@/i18n';
import { BookOpen, HelpCircle, X } from 'lucide-react';

/**
 * 画面ごとの操作ガイド（毎回表示・オフ切替つき）。
 *
 * /manual と同じ内容を、その画面の上部で「いま必要な分だけ」見せる。
 * 「表示しない」でオフにでき（全画面共通・localStorageに記憶）、
 * オフ中は右上に小さな「操作ガイドを表示」リンクだけ残るので
 * いつでも元に戻せる。文言は実際のボタン名と一致させること。
 */

const HIDE_KEY = 'page-guides-hidden';

export default function PageGuide({ steps }: { steps: React.ReactNode[] }) {
  const { t } = useLang();
  const [, setLocation] = useLocation();
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
  });
  const setHiddenPersist = (v: boolean) => {
    setHidden(v);
    try { localStorage.setItem(HIDE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
  };

  if (hidden) {
    return (
      <div className="mb-3 flex justify-end">
        <button
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setHiddenPersist(false)}
        >
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          {t('操作ガイドを表示')}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <BookOpen className="h-4 w-4 shrink-0 text-emerald-600" />
          {t('この画面の使い方')}
        </p>
        <button
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setHiddenPersist(true)}
          title={t('全画面の操作ガイドを非表示にします（いつでも戻せます）')}
        >
          <X className="h-3.5 w-3.5" />
          {t('表示しない')}
        </button>
      </div>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/90">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      <button
        className="mt-3 text-xs font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400"
        onClick={() => setLocation('/manual')}
      >
        {t('くわしい使い方マニュアルを見る')}
      </button>
    </div>
  );
}

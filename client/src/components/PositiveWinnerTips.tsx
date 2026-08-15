import { useState } from 'react';
import { useLocation } from 'wouter';
import { useLang } from '@/i18n';
import { POSITIVE_WINNERS, AVOID_PATTERNS } from '@shared/positiveWinners';
import { ChevronDown, ChevronUp, ThumbsUp, AlertTriangle } from 'lucide-react';

/**
 * 「今おすすめの型」カード。
 *
 * 実際のThreadsで“ポジティブなまま”伸びている投稿の型を提示し、
 * その型で1本作れるようAI投稿画面へ送る。あわせて、数字は出るが
 * 店舗の信用を落とす型（炎上・同情喚起・自虐）を注意として示す。
 *
 * 出典データ: shared/positiveWinners.ts（2026-08-15 実地調査）
 */
export default function PositiveWinnerTips() {
  const { t } = useLang();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-800 dark:bg-sky-950/20">
      <button
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <ThumbsUp className="h-4 w-4 shrink-0 text-sky-600" />
          {t('いま伸びている投稿の型')}
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>

      {!open && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t('実際のThreadsを調べて、炎上せずに反応が取れている型をまとめました。')}
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          {POSITIVE_WINNERS.map((w) => (
            <div key={w.id} className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-bold text-foreground">{t(w.title)}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(w.why)}</p>
              <p className="mt-1.5 rounded bg-muted/60 px-2 py-1.5 text-xs leading-relaxed text-foreground/80">
                {t(w.shape)}
              </p>
              <button
                className="mt-2 text-xs font-bold text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                onClick={() => setLocation(`/ai-generate?angle=${w.angleId}`)}
              >
                {t('この型で1本作る')}
              </button>
            </div>
          ))}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
            <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t('反応は出るけど、使わない方がいい型')}
            </p>
            <ul className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
              {AVOID_PATTERNS.map((a) => (
                <li key={a.title}>
                  <span className="font-bold">{t(a.title)}</span>
                  <br />
                  {t(a.reason)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-200/80">
              {t('※ 自動投稿ではこれらを使わないようAIに指示済みです。')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

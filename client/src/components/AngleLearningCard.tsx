import { trpc } from '@/lib/trpc';
import { useLang } from '@/i18n';
import { useThreadsAccount } from '@/components/ThreadsAccountSwitcher';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, ThumbsUp, ThumbsDown } from 'lucide-react';

/**
 * 「AIが学んだこと」カード。
 *
 * 切り口（投稿の型）ごとに、実際に何回見られたか／オーナーの◯✕評価を並べて
 * 見せる。自動投稿は成績が良い型を自動的に増やすので、その根拠を
 * クライアントが確認できるようにするのが目的。
 *
 * 実績は「公開から24時間以上たった投稿」だけを対象にしている（数字が伸びきる前の
 * 投稿を混ぜると不当に低く評価されてしまうため）。
 */
export default function AngleLearningCard() {
  const { t } = useLang();
  const { selectedAccountId } = useThreadsAccount();
  const { data } = trpc.stats.anglePerformance.useQuery({ accountId: selectedAccountId });

  const rows = (data?.rows ?? []).filter((r) => r.count > 0 || r.good > 0 || r.bad > 0);
  const overallAvg = data?.overallAvg ?? 0;

  if (rows.length === 0) {
    return (
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" />
            {t('AIが学んでいること')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t('自動投稿が公開されると、どの型（切り口）が実際によく見られたかをここに表示します。成績の良い型は自動的に増えていきます。')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" />
          {t('AIが学んでいること')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('投稿の「型」ごとの平均閲覧数です。よく見られている型を自動投稿が増やしていきます。')}
          {overallAvg > 0 && ` ${t('全体の平均は')}${overallAvg.toLocaleString()}${t('回')}`}
        </p>

        <div className="space-y-2">
          {rows.map((r) => {
            const isWinner = r.avgImpressions != null && overallAvg > 0 && r.avgImpressions >= overallAvg * 1.2 && r.count >= 3;
            return (
              <div
                key={r.id}
                className={`rounded-lg border p-3 ${isWinner ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20' : 'border-border'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words text-sm font-bold text-foreground">{t(r.label)}</span>
                  {r.avgImpressions != null && (
                    <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                      {r.avgImpressions.toLocaleString()}
                      <span className="ml-0.5 text-xs font-normal text-muted-foreground">{t('回')}</span>
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {r.count > 0 && <span>{t('投稿')}{r.count}{t('件の平均')}</span>}
                  {r.good > 0 && (
                    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <ThumbsUp className="h-3 w-3 shrink-0" />{r.good}
                    </span>
                  )}
                  {r.bad > 0 && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <ThumbsDown className="h-3 w-3 shrink-0" />{r.bad}
                    </span>
                  )}
                  {isWinner && (
                    <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                      {t('よく見られています')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
          {t('投稿履歴の◯✕でも好みを教えられます。数字と好みの両方をふまえて次の投稿を作ります。')}
        </p>
      </CardContent>
    </Card>
  );
}

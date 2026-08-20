import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useLang } from '@/i18n';
import { useThreadsAccount } from '@/components/ThreadsAccountSwitcher';
import { Button } from '@/components/ui/button';
import { MapPin, Check, Pencil, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';

/**
 * 商圏の提案カード。
 *
 * 「◯◯駅から徒歩◯分」のように商圏を狭く言い切ると新規の反応が上がる（実測）。
 * その材料はアプリが地図から自動で推定できるが、徒歩分数は直線距離からの概算で、
 * 実際と食い違うことがある（金光店では推定17分に対し実際は6分だった）。
 *
 * 広告表示に出る数字なので、**本人が確認するまで投稿には使わない**。
 * このカードで提案し、承認されて初めて運用に入る。
 */
export default function LocalAreaProposalCard() {
  const { t } = useLang();
  const [, setLocation] = useLocation();
  const { selectedAccount } = useThreadsAccount();
  const utils = trpc.useUtils();
  const [dismissed, setDismissed] = useState(false);

  const projectId = (selectedAccount as any)?.defaultProjectId as string | undefined;
  const { data } = trpc.project.localAreaProposal.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId },
  );

  const confirm = trpc.project.confirmLocalTerms.useMutation({
    onSuccess: () => {
      toast.success(t('商圏を確定しました。次の投稿から使われます'));
      utils.project.localAreaProposal.invalidate();
      setDismissed(true);
    },
    onError: (e) => toast.error(e.message),
  });

  if (dismissed || !data?.needed) return null;

  return (
    <div className="mb-6 rounded-xl border-2 border-sky-300 bg-sky-50/70 p-4 dark:border-sky-800 dark:bg-sky-950/20">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500">
          <MapPin className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-sky-900 dark:text-sky-200">
            {t('この商圏で投稿してよいですか？')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-sky-900/80 dark:text-sky-200/80">
            {t('「駅から徒歩◯分」まで絞ると、読んだ人が「うちの近くだ」と気づいて新規の反応が上がります。地図から下の内容を見つけました。')}
          </p>

          <ul className="mt-2 space-y-1 rounded-lg border border-sky-200 bg-white p-3 dark:border-sky-800 dark:bg-background">
            {data.terms.map((term) => (
              <li key={term} className="break-words text-sm font-medium text-foreground">
                ・{term}
              </li>
            ))}
          </ul>

          <p className="mt-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            {t('所要時間は地図上の直線距離からの概算です。実際と違う場合は「自分で直す」を押してください。')}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-sky-600 text-white hover:bg-sky-700"
              disabled={confirm.isPending}
              onClick={() => confirm.mutate({ projectId: data.projectId, terms: data.terms })}
            >
              {confirm.isPending
                ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />{t('保存中...')}</>
                : <><Check className="mr-1 h-4 w-4" />{t('この内容で投稿する')}</>}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLocation(`/ai-generate?project=${data.projectId}`)}
            >
              <Pencil className="mr-1 h-4 w-4" />
              {t('自分で直す')}
            </Button>
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">
            {t('確認するまで、この内容は投稿には使われません。')}
          </p>
        </div>
      </div>
    </div>
  );
}

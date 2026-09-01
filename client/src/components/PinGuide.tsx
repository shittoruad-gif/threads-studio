import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { PIN_WHY, PIN_STEPS, PIN_NOTES } from '../../../shared/pinGuide';

/**
 * 固定投稿を Threads でピン留めする手順。
 *
 * ★固定投稿は、作ってThreadsに投稿しただけでは効果が出ない。
 *   プロフィールの一番上に固定して、はじめて「お店の入口」になる。
 *   ピン留めは Threads の API では操作も確認もできないため、
 *   手順をお見せして、ご本人に「ピン留めしました」を押していただく。
 */
export default function PinGuide() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: setup } = trpc.support.setupSteps.useQuery();
  const confirmed = (setup?.steps ?? []).some(
    (s: any) => s.id === 'pin_not_confirmed' && s.done,
  );
  const confirm = trpc.support.confirmPinned.useMutation({
    onSuccess: () => {
      toast.success('ピン留めを記録しました');
      utils.support.setupSteps.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mt-3 rounded-lg border border-amber-300 bg-white/70 dark:bg-amber-950/20 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-bold text-amber-900 dark:text-amber-200">
          作ったあと、Threadsでピン留めが必要です
        </span>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 text-amber-700" /> : <ChevronDown className="w-4 h-4 shrink-0 text-amber-700" />}
      </button>

      {!open && (
        <p className="mt-1 text-xs leading-relaxed text-amber-800/80 dark:text-amber-200/70">
          投稿しただけでは、他の投稿と一緒に流れていきます。やり方を見る場合はここを開いてください。
        </p>
      )}

      {open && (
        <div className="mt-2 space-y-3">
          <p className="text-xs leading-relaxed text-foreground/80">{PIN_WHY}</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            {PIN_STEPS.map((step) => (
              <li key={step} className="text-xs leading-relaxed text-foreground/90">{step}</li>
            ))}
          </ol>
          <ul className="space-y-1">
            {PIN_NOTES.map((note) => (
              <li key={note} className="text-[11px] leading-relaxed text-muted-foreground">※ {note}</li>
            ))}
          </ul>
          {confirmed ? (
            <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              ピン留め済みとして記録しています
            </p>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="border-amber-400 text-amber-800 hover:bg-amber-100"
              onClick={() => confirm.mutate()}
              disabled={confirm.isPending}
            >
              ピン留めしました
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

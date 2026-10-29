/**
 * Threads 連携の「つなぎたいアカウントか」を確かめる2つの画面（shared/connectCheck.ts・2026-10-29）。
 *   WantedAccountDialog … 連携の前に「つなぎたいアカウントの @ユーザー名」を聞く（飛ばせる）
 *   ConnectMismatchDialog … 違うアカウントが戻ってきたとき。保存せずに、使う／やり直すを選んでいただく
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, AtSign, ChevronDown } from 'lucide-react';
import { useLang } from '@/i18n';
import {
  normalizeThreadsUsername, isValidThreadsUsername, retryGuide, notListedGuide,
  type ConnectDevice, type ConnectGuide,
} from '@shared/connectCheck';

export function WantedAccountDialog({ open, initial, onCancel, onConfirm }: {
  open: boolean;
  initial?: string | null;
  onCancel: () => void;
  /** null＝確かめずに進む */
  onConfirm: (wanted: string | null) => void;
}) {
  const { t } = useLang();
  const [value, setValue] = useState(initial ?? '');
  useEffect(() => { if (open) setValue(initial ?? ''); }, [open, initial]);
  const name = normalizeThreadsUsername(value);
  const valid = !!name && isValidThreadsUsername(name);
  const showError = value.trim().length > 0 && !valid;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-6 text-left">
            <AtSign className="w-5 h-5 shrink-0 text-emerald-600" />
            {t('つなぎたいアカウントはどれですか')}
          </DialogTitle>
          <DialogDescription className="pt-2 text-foreground/80 text-left">
            {t('Threadsは、そのときログインしているアカウントがそのままつながります。インスタを複数お持ちの方は、別のアカウントがつながることがあります。')}
            <br />
            {t('ユーザー名を入れておくと、違うアカウントがつながったときに保存せずにお知らせします。')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => { e.preventDefault(); if (valid) onConfirm(name); }}
        >
          <label htmlFor="wanted-threads-username" className="text-sm font-medium text-foreground">
            {t('つなぎたいアカウントのユーザー名（@から始まる名前）')}
          </label>
          <div className="flex items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-emerald-500">
            <span className="pl-3 text-muted-foreground">@</span>
            <input
              id="wanted-threads-username"
              className="w-full min-w-0 bg-transparent px-2 py-2.5 text-base outline-none"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="example_store"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <p className={`text-xs ${showError ? 'text-red-600' : 'text-muted-foreground'}`}>
            {showError
              ? t('英字・数字・ピリオド・アンダーバーだけの名前です（インスタのプロフィールの一番上に出ている名前）')
              : t('インスタのプロフィールの一番上に出ている名前と同じです。表示名（お店の名前など）ではありません。')}
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0 pt-2">
            <Button type="submit" className="w-full" disabled={!valid}>
              {valid ? `@${name} ${t('でつなぐ')}` : t('この名前でつなぐ')}
            </Button>
            <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={() => onConfirm(null)}>
              {t('分からないので、確かめずに進む')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GuideBlock({ guide, defaultOpen }: { guide: ConnectGuide; defaultOpen?: boolean }) {
  const { t } = useLang();
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-background">
      <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="min-w-0">{t(guide.title)}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="space-y-2 px-3 pb-3 text-sm">
          {guide.steps.map((s, i) => (
            <li key={i} className="grid grid-cols-[1.5rem_1fr] gap-1">
              <span className="font-semibold text-emerald-700 tabular-nums">{i + 1}.</span>
              <span className="min-w-0 break-words">
                {t(s.text)}
                {s.note && <span className="block text-xs text-muted-foreground mt-0.5">{t(s.note)}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export interface PendingConnectView {
  kind: 'mismatch' | 'same_as_existing';
  expected: string | null;
  profile: { username: string; name?: string | null; threads_profile_picture_url?: string | null };
}

export function ConnectMismatchDialog({ pending, device, busy, onAccept, onRetry, onClose }: {
  pending: PendingConnectView | null;
  device: ConnectDevice;
  busy?: boolean;
  onAccept: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  if (!pending) return null;
  const got = pending.profile.username;
  const wanted = pending.expected;
  const guides = retryGuide(device, wanted);
  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-6 text-left">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-500" />
            {pending.kind === 'mismatch' ? t('つなぎたいアカウントと違うアカウントでした') : t('もうつながっているアカウントでした')}
          </DialogTitle>
          <DialogDescription className="pt-2 text-foreground/80 text-left">
            {pending.kind === 'mismatch'
              ? t('Threadsでログイン中のアカウントが使われたようです。まだ保存していません（投稿も作っていません）。')
              : t('別のアカウントを足そうとしましたが、Threadsでログイン中の、もうつながっているアカウントが戻ってきました。何も変えていません。')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 min-w-0">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{t('つながりかけたアカウント')}</p>
            <div className="mt-1.5 flex items-center gap-2 min-w-0">
              {pending.profile.threads_profile_picture_url
                ? <img src={pending.profile.threads_profile_picture_url} alt="" className="w-9 h-9 rounded-full shrink-0 object-cover" />
                : <div className="w-9 h-9 rounded-full shrink-0 bg-muted" />}
              <div className="min-w-0">
                <p className="font-semibold break-all">@{got}</p>
                {pending.profile.name && <p className="text-xs text-muted-foreground truncate">{pending.profile.name}</p>}
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 min-w-0">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{t('つなぎたいアカウント')}</p>
            <p className="mt-1.5 font-semibold break-all">{wanted ? `@${wanted}` : t('別のアカウント')}</p>
            <p className="text-xs text-muted-foreground">{t('表示名が同じでも、@の名前が違えば別のアカウントです')}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t('正しいアカウントでつなぐ手順')}</p>
          {guides.map((g, i) => <GuideBlock key={g.title} guide={g} defaultOpen={i === 0} />)}
          <GuideBlock guide={notListedGuide(wanted)} />
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button className="w-full" onClick={onRetry} disabled={busy}>
            {t('正しいアカウントでやり直す')}
          </Button>
          {pending.kind === 'mismatch' && (
            <Button variant="outline" className="w-full" onClick={onAccept} disabled={busy}>
              {`@${got} ${t('で使う（こちらで合っている）')}`}
            </Button>
          )}
          {pending.kind === 'same_as_existing' && (
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose} disabled={busy}>
              {t('閉じる')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

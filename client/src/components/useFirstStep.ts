import { trpc } from '@/lib/trpc';

/**
 * 登録直後の「1本道」状態か（お店の情報なし・Threads未連携・LINE未連携）。
 * このときダッシュボードは OnboardingStart だけを出すので、共通バナーや
 * 「アプリをインストール」の吹き出しは出さない（案内が二重になり、CTAを隠していた。2026-09-08）。
 * 未ログインなら保護された問い合わせが失敗して data が無いので false になる。
 */
export function useFirstStep(): boolean {
  const count = trpc.project.count.useQuery(undefined, { retry: false });
  const accounts = trpc.threads.list.useQuery(undefined, { retry: false });
  const line = trpc.lineNotify.getStatus.useQuery(undefined, { retry: false });
  if (count.data === undefined || accounts.data === undefined || line.data === undefined) return false;
  return Number(count.data) === 0 && (accounts.data as any[]).length === 0 && !(line.data as any).linked;
}

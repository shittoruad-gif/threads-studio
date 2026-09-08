import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

/**
 * 登録直後の「1本道」状態か（お店の情報なし・Threads未連携・LINE未連携）。
 * このときダッシュボードは OnboardingStart だけを出すので、共通バナーや
 * 「アプリをインストール」の吹き出しは出さない（案内が二重になり、CTAを隠していた。2026-09-08）。
 *
 * ・未ログインでは問い合わせ自体をしない（公開ページで保護APIを叩いて401を積まない）
 * ・LINE機能が無効な環境（available=false）では1本道にしない（コードが出せず詰むため通常画面へ）
 */
export function useFirstStep(): boolean {
  const { isAuthenticated } = useAuth();
  const count = trpc.project.count.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const accounts = trpc.threads.list.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const line = trpc.lineNotify.getStatus.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  if (!isAuthenticated) return false;
  if (count.data === undefined || accounts.data === undefined || line.data === undefined) return false;
  const l: any = line.data;
  if (!l.available) return false;
  return Number(count.data) === 0 && (accounts.data as any[]).length === 0 && !l.linked;
}

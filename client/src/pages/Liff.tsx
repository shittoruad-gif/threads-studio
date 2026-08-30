import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Loader2 } from 'lucide-react';

/**
 * LIFFエントリーページ（LINEトーク内でアプリを開くための入口）。
 *
 * リッチメニューや通知のボタンは https://liff.line.me/{LIFF_ID}?path=/xxx を開き、
 * LINEがこのページ（/liff）をトーク内ブラウザで表示する。ここで
 *   1. LIFF SDKを初期化してLINEのIDトークンを取得
 *   2. サーバーで検証し、連携済みならセッションCookieを発行（自動ログイン）
 *   3. ?path= のページへ移動
 * 未連携の場合だけ、初回に通常ログインをはさみ、成功後にそのまま自動連携する。
 */
export default function Liff() {
  const [message, setMessage] = useState('LINEと接続しています…');
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const config = trpc.lineNotify.liffConfig.useQuery(undefined, { refetchOnWindowFocus: false });
  const liffLogin = trpc.lineNotify.liffLogin.useMutation();
  const linkByLiff = trpc.lineNotify.linkByLiff.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!config.data || started.current) return;
    started.current = true;

    (async () => {
      try {
        // 開き先（同一オリジンのパスのみ許可）
        const params = new URLSearchParams(window.location.search);
        const rawPath = params.get('path') || '/dashboard';
        const target = rawPath.startsWith('/') && !rawPath.startsWith('//') ? rawPath : '/dashboard';

        if (!config.data.enabled || !config.data.liffId) {
          // LIFF未設定ならそのまま目的ページへ（通常のログイン導線に任せる）
          window.location.replace(target);
          return;
        }

        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId: config.data.liffId });
        if (!liff.isLoggedIn()) {
          // LINEアプリ内なら自動でログイン済みになる。外部ブラウザではLINEログインへ。
          liff.login({ redirectUri: window.location.href });
          return;
        }

        const idToken = liff.getIDToken();
        if (!idToken) {
          throw new Error('LINEの本人情報を取得できませんでした');
        }

        const res = await liffLogin.mutateAsync({ idToken });
        if (res.ok) {
          window.location.replace(target);
          return;
        }

        // 未連携: すでにアプリにログイン済みならその場で連携、
        // 未ログインならログイン画面へ（成功後にここへ戻って連携する）
        const me = await utils.auth.me.fetch();
        if (me) {
          await linkByLiff.mutateAsync({ idToken });
          window.location.replace(target);
          return;
        }
        setMessage('初回だけ、アプリのログインをお願いします。次回からはこの画面は出ません。');
        const back = `/liff?path=${encodeURIComponent(target)}`;
        setTimeout(() => {
          window.location.replace(`/login?redirect=${encodeURIComponent(back)}`);
        }, 1500);
      } catch (e: any) {
        console.error('[LIFF] 初期化エラー:', e);
        setFailed(true);
        setMessage('LINEとの接続に失敗しました。トークに戻って、もう一度ボタンを押してください。');
      }
    })();
  }, [config.data]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      {!failed && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

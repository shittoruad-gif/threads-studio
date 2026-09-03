import { useAuth } from '@/_core/hooks/useAuth';
import { useLang } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import { Link2, Unlink, AlertCircle, Plus, User, RefreshCw, Users, ShieldCheck, Info, ChevronRight, Monitor } from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { getLoginUrl } from '@/const';
import PageGuide from '@/components/PageGuide';
import { useEffect, useState, useRef } from 'react';

/** LINEから来られたことを、OAuthの往復をまたいで覚えておくための印 */
const FROM_LINE_KEY = 'ts-oauth-from-line';

export default function ThreadsConnect() {
  const { isAuthenticated, loading } = useAuth();
  const { t, lang } = useLang();
  const [, setLocation] = useLocation();
  const [oauthCode, setOauthCode] = useState<string | null>(null);
  const callbackProcessed = useRef(false);
  const [isProcessingCallback, setIsProcessingCallback] = useState(false);
  const [disconnectTargetId, setDisconnectTargetId] = useState<number | null>(null);

  // Step 1: Extract OAuth code from URL on mount (before any redirects)
  useEffect(() => {
    const fullUrl = window.location.href;
    const urlObj = new URL(fullUrl);
    let code = urlObj.searchParams.get('code');
    const error = urlObj.searchParams.get('error');
    
    if (error) {
      if (error === 'access_denied') {
        toast.error(t("Threadsの認証がキャンセルされました"));
      } else {
        toast.error(`${t('認証エラー')}: ${error}`);
      }
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    
    if (code) {
      // Remove Threads' #_ suffix if present
      code = code.replace(/#_$/, '');
      setOauthCode(code);
      setIsProcessingCallback(true);
      // Clean URL but keep the code in state
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Redirect to login only if NOT processing a callback
  useEffect(() => {
    if (!loading && !isAuthenticated && !oauthCode && !isProcessingCallback) {
      window.location.href = getLoginUrl();
    }
  }, [loading, isAuthenticated, oauthCode, isProcessingCallback]);

  // Step 2: Process the stored code once authentication is confirmed
  useEffect(() => {
    if (oauthCode && isAuthenticated && !callbackProcessed.current) {
      callbackProcessed.current = true;
      handleCallback.mutate({ code: oauthCode });
      setOauthCode(null);
    }
  }, [oauthCode, isAuthenticated]);

  const { data: subscription } = trpc.subscription.getStatus.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: accounts, refetch } = trpc.threads.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Two OAuth URLs:
  //  - reuses the current Threads session (used for re-connecting / first-time)
  //  - forces re-auth so the user can pick a different Threads account
  const { data: authUrlData } = trpc.threads.getAuthUrl.useQuery(
    {},
    { enabled: isAuthenticated }
  );
  const { data: authUrlForceData } = trpc.threads.getAuthUrl.useQuery(
    { forceReauth: true },
    { enabled: isAuthenticated }
  );

  // Track whether the user explicitly intended to add a DIFFERENT account
  // (set when they confirm the pre-OAuth guide modal)
  const userIntentRef = useRef<'add-different' | 'reconnect' | null>(null);
  const [showSameAccountGuide, setShowSameAccountGuide] = useState(false);

  // ★LINEから来た場合は、連携後に「LINEに戻る」導線を出す（?from=line）
  //
  //   Threadsからの戻り先は redirect_uri（/threads-connect）だけで、`from=line` は
  //   往路で消える。さらに mount 直後に replaceState でクエリを丸ごと落としている。
  //   そのため毎回の描画で window.location.search を見ていると、連携が終わった
  //   （justConnected）ときには必ず false になり、「LINEに戻る」が一度も出ない。
  //   （2026-09-03、連携できているお客様から「LINEに戻りません」とご連絡があった）
  //   往路で印を残し、初回描画のときに一度だけ読んで覚えておく。
  //   ★印を消すのはここではなく、連携の処理が終わったあと（onSuccess / onError）。
  //     この画面は認証の解決などで作り直されることがあり、描画のときに消すと
  //     作り直された2回目で印が無くなって、結局「LINEに戻る」が出なくなる。
  const [fromLine] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).get('from') === 'line') return true;
    try {
      return localStorage.getItem(FROM_LINE_KEY) === '1';
    } catch { /* localStorageが使えなくても、従来どおり出さないだけ */ }
    return false;
  });
  const [justConnected, setJustConnected] = useState(false);

  const utils = trpc.useUtils();
  const handleCallback = trpc.threads.handleCallback.useMutation({
    onSuccess: (data) => {
      setIsProcessingCallback(false);
      // 連携と同時にサーバー側でデモモードが解除されるので、帯（DemoModeBanner）を即座に消す
      utils.setup.getDemoMode.invalidate();
      if (data.isReconnection) {
        // If the user clicked "別のThreadsアカウントを連携" but ended up reconnecting
        // the SAME account, show a guide explaining how to switch Threads account.
        if (userIntentRef.current === 'add-different') {
          setShowSameAccountGuide(true);
        } else {
          toast.success(t("Threadsとの接続をやり直しました（有効期限を更新）"));
        }
      } else {
        toast.success(t("Threadsアカウントを連携しました"));
      }
      setJustConnected(true);
      userIntentRef.current = null;
      // 役目を終えた印を消す（1回の連携ぶんだけ覚えておけばよい）
      try { localStorage.removeItem(FROM_LINE_KEY); } catch { /* 消せなくても支障はない */ }
      refetch();
    },
    onError: (error) => {
      setIsProcessingCallback(false);
      console.error('[Threads OAuth] Callback error:', error);
      callbackProcessed.current = false;
      userIntentRef.current = null;
      try { localStorage.removeItem(FROM_LINE_KEY); } catch { /* 消せなくても支障はない */ }
      toast.error(`${t('連携エラー')}: ${error.message}`);
    },
  });

  const disconnectAccount = trpc.threads.disconnect.useMutation({
    onSuccess: () => {
      toast.success(t("アカウントの連携を解除しました"));
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const syncProfile = trpc.threads.syncProfile.useMutation({
    onSuccess: () => {
      toast.success(t("プロフィールを同期しました"));
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const refreshToken = trpc.threads.refreshToken.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const refreshAllTokens = trpc.threads.refreshAllTokens.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // ★複数店舗対応：アカウントごとに「自動投稿する店舗(プロジェクト)」を割り当てる
  const { data: projectList } = trpc.project.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const setDefaultProject = trpc.threads.setDefaultProject.useMutation({
    onSuccess: () => {
      toast.success(t("このアカウントの自動投稿の店舗を設定しました"));
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Internal: actually start the OAuth redirect.
  //  - mode 'reconnect': reuse current Threads session (token refresh / first connect)
  //  - mode 'switch':    force re-authentication so the user can pick a different
  //                      Threads account (auth_type=reauthenticate)
  const startOAuth = (mode: 'reconnect' | 'switch') => {
    const url = mode === 'switch' ? authUrlForceData?.authUrl : authUrlData?.authUrl;
    if (!url) {
      toast.error(t("認証URLを取得できませんでした"));
      return;
    }
    userIntentRef.current = mode === 'switch' ? 'add-different' : 'reconnect';
    // Save any form state to localStorage before OAuth redirect
    try {
      const currentUrl = window.location.href;
      localStorage.setItem('ts-pre-oauth-url', currentUrl);
      // ★LINEから来られた方は、戻ってきたときに「LINEに戻る」を出す必要がある。
      //   往路のクエリはThreadsの戻り先に引き継がれないので、ここで印を残す。
      if (fromLine) localStorage.setItem(FROM_LINE_KEY, '1');
    } catch (e) {
      // Ignore localStorage errors
    }
    window.location.href = url;
  };

  // Click handler for "別のThreadsアカウントを連携" button.
  // We pass `forceReauth=true` to the OAuth URL so Threads shows the login
  // screen even if a session exists, letting the user pick a different account
  // in one click — no manual logout/incognito gymnastics required.
  const handleAddDifferentAccountClick = () => {
    if ((accounts?.length || 0) > 0) {
      // Existing accounts → user wants to add a DIFFERENT one → force re-auth
      startOAuth('switch');
    } else {
      // First-time connection → reuse current session
      startOAuth('reconnect');
    }
  };

  // Per-account "再連携" button → token refresh for the SAME account
  const handleReconnect = () => {
    startOAuth('reconnect');
  };

  const maxAccounts = subscription?.plan?.features?.maxThreadsAccounts || 0;
  const canAddMore = maxAccounts === -1 || (accounts?.length || 0) < maxAccounts;

  if (loading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-500 border-t-transparent mx-auto mb-4"></div>
          {isProcessingCallback ? (
            <>
              <p className="text-foreground/80 text-lg font-medium">{t("認証情報を確認中...")}</p>
              <p className="text-muted-foreground text-sm mt-2">{t("しばらくお待ちください")}</p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{t("読み込み中...")}</p>
          )}
        </div>
      </div>
    );
  }

  if (handleCallback.isPending || isProcessingCallback) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-foreground/80 text-lg font-medium">{t("アカウントを連携中...")}</p>
          <p className="text-muted-foreground text-sm mt-2">{t("Threadsとの接続を確立しています")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium mb-2">
          <Link2 className="w-4 h-4" />
          ACCOUNT
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">{t('Threads連携')}</h1>
        <p className="text-muted-foreground">
          {t('Threadsアカウントを連携して、直接投稿できるようになります')}
        </p>
      </div>

      <PageGuide steps={[
        <>{t('接続には')}<b>{t('60日の有効期限')}</b>{t('があります。期限が近づくと黄色いお知らせが出ます')}</>,
        <>{t('お知らせが出たら')}<b>{t('接続を更新')}</b>{t('を押すだけで60日延長されます')}</>,
        <>{t('直らないときだけ')}<b>{t('接続をやり直す')}</b>{t('→Threadsの画面で')}<b>{t('許可')}</b>{t('（パソコン推奨）')}</>,
      ]} />

      {/* ★LINEから来た方向け。連携が終わったらワンタップでトークに戻れるようにする
          （LINE→ブラウザ→LINE の往復が切れると「終わったのか分からない」ため）。 */}
      {fromLine && justConnected && (
        <div className="bg-teal-50 border-2 border-teal-300 rounded-xl p-4 mb-4">
          <p className="text-teal-900 font-bold text-sm sm:text-base">
            {t('連携が完了しました。LINEに戻って続きを進めましょう。')}
          </p>
          <p className="text-teal-800 text-xs sm:text-sm mt-1 leading-relaxed">
            {t('LINEのトークで「はじめの設定」を押すと、このアカウント用のお店の情報を登録できます。')}
          </p>
          <a
            href="https://line.me/R/ti/p/@936rschf"
            className="inline-flex items-center justify-center mt-3 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold hover:bg-teal-700"
          >
            {t('LINEに戻る')}
          </a>
        </div>
      )}

      {/* PC推奨バナー（全ユーザー・初回から表示）。スマホではThreadsアプリの横取り等で
          「このページは存在しません」に飛ぶ事例があるため、まずPCを強く推奨する。 */}
      <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 mb-4 flex items-start gap-3">
        <Monitor className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-emerald-900 font-bold text-sm sm:text-base">
            {t('連携は「パソコン」から行うのがおすすめです')}
          </p>
          <p className="text-emerald-800 text-xs sm:text-sm mt-1 leading-relaxed">
            {t('スマホだと、Threadsアプリの影響でうまく連携できず「このページは存在しません」と表示されることがあります。パソコンのブラウザで')}
            {' '}<code className="px-1 bg-white/70 rounded text-[13px]">threads-studio.com</code>{' '}
            {t('を開いて連携すると確実です。')}
          </p>
        </div>
      </div>

      {/* 3ステップ案内。①ボタン→②Threadsログイン→③許可 の流れを視覚的に示す。 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-foreground/80 text-sm">
          <strong>{t('連携の前に：')}</strong> {t('連携したいアカウントでThreads（Instagram）にログインできる状態にしておいてください。')}
        </p>
      </div>
      {/* 手順書への導線。担当者が資料を送らなくても、利用者が自分で開けるようにする。 */}
      <div className="mb-4 text-sm">
        <a
          href="/threads-setup-guide"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400"
        >
          {t('うまくいかない方へ：設定手順を最初から見る')}
        </a>
        <span className="text-muted-foreground ml-1">
          {t('（Facebookアカウントの作成から順に説明しています）')}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {[
          {
            n: 1,
            title: t('「Threadsと連携」を押す'),
            desc: t('下の緑色のボタンを1回押します。Threadsのログイン画面が開きます。'),
          },
          {
            n: 2,
            title: t('Threadsにログイン'),
            desc: t('Threads（Instagram）のIDとパスワードでログインします。'),
          },
          {
            n: 3,
            title: t('「許可」を押す'),
            desc: t('アプリに与える権限の確認画面で「許可」を押すと、この画面に戻り連携完了です。'),
          },
        ].map((step) => (
          <div key={step.n} className="bg-background border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-sm">
                {step.n}
              </span>
              <p className="text-sm font-semibold text-foreground">{step.title}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </div>

      {/* Account Limit */}
      <div className="bg-background border border-border rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50">
              <Link2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-foreground font-medium">{t("連携アカウント数")}</p>
              <p className="text-muted-foreground text-sm">
                {accounts?.length || 0} / {maxAccounts === -1 ? t('無制限') : maxAccounts}
              </p>
            </div>
          </div>
          {maxAccounts === 0 && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setLocation('/pricing')}
            >
              {t("プランをアップグレード")}
            </Button>
          )}
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="space-y-4 mb-8">
        {accounts?.map((account) => (
          <div key={account.id} className="bg-background border border-border rounded-xl p-6">
            {/* Account Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-4 min-w-0">
                {account.profilePictureUrl ? (
                  <>
                    <img
                      src={account.profilePictureUrl}
                      alt={`${account.threadsUsername || 'user'} ${t('のプロフィール画像')}`}
                      className="w-14 h-14 rounded-full object-cover border-2 border-border/50 shrink-0"
                      onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextElementSibling?.classList.remove("hidden"); }}
                    />
                    <div className="hidden w-14 h-14 rounded-full bg-emerald-100 items-center justify-center shrink-0 [&:not(.hidden)]:flex">
                      <User className="w-7 h-7 text-emerald-600" />
                    </div>
                  </>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <User className="w-7 h-7 text-emerald-600" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-foreground font-semibold text-lg truncate">@{account.threadsUsername}</p>
                  <p className="text-muted-foreground/60 text-sm truncate">ID: {account.threadsUserId}</p>
                </div>
              </div>
              {/* モバイルは2列グリッドで整列、sm以上は横並び。
                  shadcn Buttonは whitespace-nowrap 既定のため、長い日本語ラベルが
                  枠からはみ出す（実機で報告あり）。whitespace-normal + h-auto で
                  ボタン内折返しを許可し、どの幅でも収まるようにする。 */}
              <div className="grid grid-cols-2 sm:flex gap-2 sm:flex-wrap sm:justify-end shrink-0 [&>button]:w-full sm:[&>button]:w-auto [&>button]:whitespace-normal [&>button]:h-auto [&>button]:min-h-8 [&>button]:py-1.5 [&>button]:leading-snug">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  onClick={() => refreshToken.mutate({ accountId: account.id })}
                  disabled={refreshToken.isPending}
                  title={t("同じアカウントのまま、接続の有効期限を60日延長します")}
                >
                  <ShieldCheck className={`w-4 h-4 mr-1.5 shrink-0 ${refreshToken.isPending ? 'animate-spin' : ''}`} />
                  {t("接続を更新")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={handleReconnect}
                  disabled={handleCallback.isPending}
                  title={t("Threadsのログイン画面でやり直して接続を作り直します（別のアカウントへの切り替えもこちら）")}
                >
                  <Link2 className="w-4 h-4 mr-1.5" />
                  {t("接続をやり直す")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-muted-foreground border-border hover:bg-muted/50"
                  onClick={() => syncProfile.mutate({ accountId: account.id })}
                  disabled={syncProfile.isPending}
                >
                  <RefreshCw className={`w-4 h-4 mr-1.5 ${syncProfile.isPending ? 'animate-spin' : ''}`} />
                  {t("同期")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-500 border-red-200 hover:bg-red-50"
                  onClick={() => setDisconnectTargetId(account.id)}
                  disabled={disconnectAccount.isPending}
                >
                  <Unlink className="w-4 h-4 mr-1.5" />
                  {t("連携解除")}
                </Button>
              </div>
            </div>

            {/* ★複数店舗対応：このアカウントで自動投稿する店舗 */}
            {projectList && projectList.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border/60">
                <label className="block text-xs font-medium text-foreground/80 mb-1.5">
                  {t("このアカウントで自動投稿する店舗")}
                </label>
                <select
                  value={(account as any).defaultProjectId ?? ''}
                  onChange={(e) =>
                    setDefaultProject.mutate({
                      accountId: account.id,
                      projectId: e.target.value || null,
                    })
                  }
                  disabled={setDefaultProject.isPending}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm"
                >
                  <option value="">{t("全店舗を日替わりで投稿")}</option>
                  {projectList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {(p as any).storeName || p.title}
                    </option>
                  ))}
                </select>
                <p className="text-[13px] text-muted-foreground mt-1">
                  {t("複数店舗を運用する場合、このアカウント＝この店舗、と指定すると内容の取り違えを防げます。")}
                </p>
              </div>
            )}

            {/* Biography */}
            {account.biography && (
              <div className="mb-4 p-3 rounded-lg bg-muted/50">
                <p className="text-foreground/80 text-sm">{account.biography}</p>
              </div>
            )}

            {/* Token Status */}
            {account.tokenExpiresAt && (() => {
              const expiresAt = new Date(account.tokenExpiresAt);
              const now = new Date();
              const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              const isExpired = daysLeft <= 0;
              const isExpiringSoon = daysLeft > 0 && daysLeft <= 7;
              return (isExpired || isExpiringSoon) ? (
                <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${isExpired ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                  <AlertCircle className={`w-4 h-4 flex-shrink-0 ${isExpired ? 'text-red-500' : 'text-yellow-600'}`} />
                  <p className={`text-sm flex-1 ${isExpired ? 'text-red-700' : 'text-yellow-700'}`}>
                    {isExpired
                      ? t('Threadsとの接続の有効期限が切れています。自動投稿が停止しています。「接続を更新」を押すと復旧します。')
                      : `${t('Threadsとの接続の有効期限が残り')}${daysLeft}${t('日です。期限が切れると自動投稿が停止します。早めの更新がおすすめです。')}`
                    }
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`flex-shrink-0 ${isExpired ? 'text-red-600 hover:bg-red-100' : 'text-yellow-700 hover:bg-yellow-100'}`}
                    onClick={() => refreshToken.mutate({ accountId: account.id })}
                    disabled={refreshToken.isPending}
                  >
                    <ShieldCheck className={`w-4 h-4 mr-1 ${refreshToken.isPending ? 'animate-spin' : ''}`} />
                    {t("接続を更新")}
                  </Button>
                </div>
              ) : null;
            })()}

            {/* Stats */}
            <div className="flex items-center gap-6 flex-wrap text-sm">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-500" />
                <span className="text-muted-foreground">
                  {t("フォロワー")}: <span className="text-foreground font-medium">{account.followersCount?.toLocaleString() || 0}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-500" />
                <span className="text-muted-foreground">
                  {t("フォロー中")}: <span className="text-foreground font-medium">{account.followingCount?.toLocaleString() || 0}</span>
                </span>
              </div>
              {account.tokenExpiresAt && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground/60 text-xs">
                    {t("接続の有効期限")}: {new Date(account.tokenExpiresAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'ja-JP')}
                  </span>
                </div>
              )}
              {account.lastSyncedAt && (
                <div className="w-full sm:w-auto sm:ml-auto text-muted-foreground/60 text-xs">
                  {t("最終同期")}: {new Date(account.lastSyncedAt).toLocaleString(lang === 'en' ? 'en-US' : 'ja-JP')}
                </div>
              )}
            </div>
          </div>
        ))}

        {accounts?.length === 0 && (
          <div className="bg-background border border-border border-dashed rounded-xl p-10 text-center">
            <Link2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-foreground font-medium mb-1">{t('まだThreadsアカウントが連携されていません')}</p>
            <p className="text-muted-foreground/70 text-sm mb-5">
              {t('連携すると、AIで作った投稿をこのアプリから直接投稿・自動投稿できます。')}
            </p>
            {maxAccounts > 0 ? (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6"
                onClick={handleAddDifferentAccountClick}
                disabled={handleCallback.isPending || !authUrlData}
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('Threadsと連携する')}
              </Button>
            ) : (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6"
                onClick={() => setLocation('/pricing')}
              >
                {t('プランを選んで連携を始める')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Bulk Token Refresh */}
      {(accounts?.length || 0) > 1 && (
        <div className="mb-6">
          <Button
            variant="outline"
            className="w-full border-emerald-200 text-emerald-600 hover:bg-emerald-50 py-5"
            onClick={() => refreshAllTokens.mutate()}
            disabled={refreshAllTokens.isPending}
          >
            <ShieldCheck className={`w-5 h-5 mr-2 ${refreshAllTokens.isPending ? 'animate-spin' : ''}`} />
            {t('全アカウントの接続をまとめて更新（期限を延長）')}
          </Button>
        </div>
      )}

      {/* 追加連携が難しい理由と3つの解決策の事前ガイド。
          既に1件以上連携済みで、まだ追加余地がある時だけ表示する。
          「なぜ同じアカウントが出るのか」を先に説明し、方法A/B/Cを提示することで、
          Threads OAuth 特有のはまりどころを回避してもらう。 */}
      {(accounts?.length || 0) > 0 && canAddMore && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {t('別のアカウントを連携するときの注意')}
              </p>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                {t('下のボタンを押しても、Threadsが「今使っているアカウントとして続行」と表示してしまい、別のアカウントを選べないことがあります（Threadsの仕様）。')}
                {' '}<strong>{t('特にスマホでは、Threadsアプリの影響で「このページは存在しません」と表示され、うまく進まないことがあります。')}</strong>
                {' '}{t('次の方法のどれかで、追加したいアカウントに切り替えてから連携ボタンを押してください。')}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {/* 方法A：パソコンでログアウトしてから連携（最推奨・確実） */}
            <details className="rounded-lg bg-white border border-amber-200 group" open>
              <summary className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer list-none">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">A</span>
                  {t('【一番おすすめ】パソコンでThreadsからログアウトしてから連携する')}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-open:rotate-90 transition-transform" />
              </summary>
              <ol className="px-3 pb-3 pt-1 space-y-1.5 text-xs text-foreground/80 leading-relaxed">
                <li>1. <strong>{t('パソコンのブラウザ')}</strong>{t('で別タブを開き、')} <a href="https://www.threads.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">threads.com</a> {t('を開く')}</li>
                <li>2. {t('プロフィールアイコン → 設定 →「ログアウト」を押す')}</li>
                <li>3. {t('この画面に戻って「別のThreadsアカウントを連携」を押す')}</li>
                <li>4. {t('Threadsのログイン画面が出る → 追加したいアカウントのID・パスワードを入力')}</li>
                <li>5. {t('権限確認画面で「許可 (Allow)」を押す → 新しいアカウントが追加されます')}</li>
              </ol>
            </details>

            {/* 方法B：パソコンのシークレットウィンドウ */}
            <details className="rounded-lg bg-white border border-amber-200 group">
              <summary className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer list-none">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">B</span>
                  {t('パソコンのシークレットウィンドウを使う')}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-open:rotate-90 transition-transform" />
              </summary>
              <ol className="px-3 pb-3 pt-1 space-y-2 text-xs text-foreground/80 leading-relaxed">
                <li>1. <strong>{t('パソコン')}</strong>{t('で新しいシークレットウィンドウ / プライベートウィンドウを開く')}</li>
                <li>
                  2. {t('シークレットウィンドウのアドレスバーに以下のURLを貼り付ける：')}
                  <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5">
                    <code className="flex-1 text-[13px] font-mono text-emerald-800 break-all">https://threads-studio.com/login</code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText('https://threads-studio.com/login')
                          .then(() => toast.success(t("URLをコピーしました")))
                          .catch(() => toast.error(t("コピーに失敗しました")));
                      }}
                      className="flex-shrink-0 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium px-2 py-1"
                    >
                      {t('コピー')}
                    </button>
                  </div>
                  <p className="mt-1.5 flex items-start gap-1 text-[11px] text-red-700">
                    <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    <span>
                      {t('⚠️ 「threads.com」ではありません（それはThreads本体で、このアプリではありません）。必ず「threads-')}<strong>{t('studio')}</strong>{t('.com」')}
                    </span>
                  </p>
                </li>
                <li>3. {t('メールアドレスとパスワードでThreads Studioにログイン')}</li>
                <li>4. {t('サイドバーの「Threads連携」を開いて「別のThreadsアカウントを連携」を押す')}</li>
                <li>5. {t('Threadsのログイン画面が出る → 追加したいアカウントのID・パスワードを入力')}</li>
                <li>6. {t('権限確認画面で「許可 (Allow)」を押す → 新しいアカウントが追加されます')}</li>
              </ol>
            </details>

            {/* 方法C：スマホの場合（シークレットモードは避ける） */}
            <details className="rounded-lg bg-white border border-amber-200 group">
              <summary className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer list-none">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-xs">C</span>
                  {t('どうしてもスマホで行う場合')}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-open:rotate-90 transition-transform" />
              </summary>
              <div className="px-3 pb-3 pt-1 text-xs text-foreground/80 leading-relaxed">
                <p className="mb-2 flex items-start gap-1 text-[11px] text-red-700">
                  <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <span>{t('⚠️ スマホの「シークレットモード / プライベートブラウズ」は使わないでください。Threadsアプリに横取りされ、うまく連携できないことがあります。必ず通常のブラウザで行ってください。')}</span>
                </p>
                <ol className="space-y-1.5">
                  <li>1. {t('スマホのThreadsアプリを開く')}</li>
                  <li>2. {t('プロフィールタブ → 上部のアカウント名をタップ → 追加したいアカウントに切り替え')}</li>
                  <li>3. {t('（未追加の場合は「アカウントを追加」→ 追加したいアカウントでログイン → 切り替え）')}</li>
                  <li>4. {t('同じスマホの通常ブラウザ（シークレットではない）でこの画面を開いて「別のThreadsアカウントを連携」を押す')}</li>
                  <li>5. {t('権限確認画面で「許可 (Allow)」を押す')}</li>
                </ol>
              </div>
            </details>
          </div>

          <p className="text-[11px] text-amber-800/70 mt-3 leading-relaxed">
            <strong>{t('補足：')}</strong>{t('「連携解除」を押すと現在のアカウントの連携が切れてしまうので、複数アカウントを両方使いたい場合は解除せず、上の3つのどれかを使ってください。')}
          </p>
        </div>
      )}

      {/* Connect Button（未連携時は空状態カード内のボタンに集約し、ここでは追加連携のみ表示） */}
      {maxAccounts > 0 && (accounts?.length || 0) > 0 && (
        <div className="space-y-3">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-6 text-base"
            onClick={handleAddDifferentAccountClick}
            disabled={handleCallback.isPending || !authUrlData}
          >
            <Plus className="w-5 h-5 mr-2" />
            {t((accounts?.length || 0) > 0 ? '別のThreadsアカウントを連携' : 'Threadsと連携')}
          </Button>
          {(accounts?.length || 0) > 0 && canAddMore && (
            <p className="text-center text-muted-foreground/60 text-xs flex items-center justify-center gap-1">
              <Info className="w-3 h-3" />
              {t('上の3つの方法のどれかで別アカウントに切り替えてからこのボタンを押してください')}
            </p>
          )}
          {!canAddMore && (
            <p className="text-center text-muted-foreground/60 text-sm">
              {t("※ 新しいアカウントの追加は上限に達していますが、既存アカウントの接続更新・やり直しは可能です")}
            </p>
          )}
        </div>
      )}
      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={disconnectTargetId !== null} onOpenChange={() => setDisconnectTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("アカウント連携を解除しますか？")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("このアカウントの連携を解除すると、予約投稿や自動投稿が停止します。再度連携することで復旧できます。")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("キャンセル")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (disconnectTargetId) {
                  disconnectAccount.mutate({ accountId: disconnectTargetId });
                  setDisconnectTargetId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("連携を解除する")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Post-OAuth fallback: same account got connected even after force-reauth.
          (Rare — only happens if the user clicks Continue with the same Threads
          account on the OAuth screen.) Show a one-screen recovery guide. */}
      <Dialog open={showSameAccountGuide} onOpenChange={setShowSameAccountGuide}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              {t("同じアカウントが連携されました")}
            </DialogTitle>
            <DialogDescription className="pt-2 text-foreground/80">
              {t("認証画面で同じアカウントを選んだため、既存の接続の有効期限が更新されました。")}
              <br /><br />
              <strong>{t("別のアカウントを追加")}</strong>{t("するには、もう一度")}
              {t("「別のThreadsアカウントを連携」をクリックして、Threadsのログイン画面で")}
              <strong>{t("「別のアカウントでログイン」")}</strong>{t("を選んでください。")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowSameAccountGuide(false)}>
              {t("わかりました")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

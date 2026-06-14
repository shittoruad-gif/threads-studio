import { useAuth } from '@/_core/hooks/useAuth';
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
import { Link2, Unlink, AlertCircle, Plus, User, RefreshCw, Users, ShieldCheck, Info } from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { getLoginUrl } from '@/const';
import { useEffect, useState, useRef } from 'react';

export default function ThreadsConnect() {
  const { isAuthenticated, loading } = useAuth();
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
        toast.error('Threadsの認証がキャンセルされました');
      } else {
        toast.error(`認証エラー: ${error}`);
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

  const handleCallback = trpc.threads.handleCallback.useMutation({
    onSuccess: (data) => {
      setIsProcessingCallback(false);
      if (data.isReconnection) {
        // If the user clicked "別のThreadsアカウントを連携" but ended up reconnecting
        // the SAME account, show a guide explaining how to switch Threads account.
        if (userIntentRef.current === 'add-different') {
          setShowSameAccountGuide(true);
        } else {
          toast.success('Threadsアカウントを再連携しました（トークンを更新）');
        }
      } else {
        toast.success('Threadsアカウントを連携しました');
      }
      userIntentRef.current = null;
      refetch();
    },
    onError: (error) => {
      setIsProcessingCallback(false);
      console.error('[Threads OAuth] Callback error:', error);
      callbackProcessed.current = false;
      userIntentRef.current = null;
      toast.error(`連携エラー: ${error.message}`);
    },
  });

  const disconnectAccount = trpc.threads.disconnect.useMutation({
    onSuccess: () => {
      toast.success('アカウントの連携を解除しました');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const syncProfile = trpc.threads.syncProfile.useMutation({
    onSuccess: () => {
      toast.success('プロフィールを同期しました');
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

  // Internal: actually start the OAuth redirect.
  //  - mode 'reconnect': reuse current Threads session (token refresh / first connect)
  //  - mode 'switch':    force re-authentication so the user can pick a different
  //                      Threads account (auth_type=reauthenticate)
  const startOAuth = (mode: 'reconnect' | 'switch') => {
    const url = mode === 'switch' ? authUrlForceData?.authUrl : authUrlData?.authUrl;
    if (!url) {
      toast.error('認証URLを取得できませんでした');
      return;
    }
    userIntentRef.current = mode === 'switch' ? 'add-different' : 'reconnect';
    // Save any form state to localStorage before OAuth redirect
    try {
      const currentUrl = window.location.href;
      localStorage.setItem('ts-pre-oauth-url', currentUrl);
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
              <p className="text-foreground/80 text-lg font-medium">認証情報を確認中...</p>
              <p className="text-muted-foreground text-sm mt-2">しばらくお待ちください</p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">読み込み中...</p>
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
          <p className="text-foreground/80 text-lg font-medium">アカウントを連携中...</p>
          <p className="text-muted-foreground text-sm mt-2">Threadsとの接続を確立しています</p>
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
        <h1 className="text-2xl font-bold text-foreground mb-2">Threads連携</h1>
        <p className="text-muted-foreground">
          Threadsアカウントを連携して、直接投稿できるようになります
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-foreground/80 text-sm">
            <strong>連携の前に：</strong> スマホのThreads（Instagram）にログインできる状態にしておいてください。
            下の「Threadsと連携」ボタンを押すとThreadsの画面が開くので、<strong>「許可」を押すだけ</strong>で完了です。
            連携すると、AIで作った投稿をこのアプリから直接投稿・自動投稿できるようになります。
          </p>
        </div>
      </div>

      {/* Account Limit */}
      <div className="bg-background border border-border rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50">
              <Link2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-foreground font-medium">連携アカウント数</p>
              <p className="text-muted-foreground text-sm">
                {accounts?.length || 0} / {maxAccounts === -1 ? '無制限' : maxAccounts}
              </p>
            </div>
          </div>
          {maxAccounts === 0 && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setLocation('/pricing')}
            >
              プランをアップグレード
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
                  <img
                    src={account.profilePictureUrl}
                    alt={`${account.threadsUsername || 'ユーザー'}のプロフィール画像`}
                    className="w-14 h-14 rounded-full object-cover border-2 border-border/50 shrink-0"
                  />
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
              <div className="flex gap-2 flex-wrap sm:justify-end shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  onClick={() => refreshToken.mutate({ accountId: account.id })}
                  disabled={refreshToken.isPending}
                  title="トークンを自動更新（60日延長）"
                >
                  <ShieldCheck className={`w-4 h-4 mr-1.5 ${refreshToken.isPending ? 'animate-spin' : ''}`} />
                  トークン更新
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={handleReconnect}
                  disabled={handleCallback.isPending}
                  title="トークンを更新して再連携"
                >
                  <Link2 className="w-4 h-4 mr-1.5" />
                  再連携
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-muted-foreground border-border hover:bg-muted/50"
                  onClick={() => syncProfile.mutate({ accountId: account.id })}
                  disabled={syncProfile.isPending}
                >
                  <RefreshCw className={`w-4 h-4 mr-1.5 ${syncProfile.isPending ? 'animate-spin' : ''}`} />
                  同期
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-500 border-red-200 hover:bg-red-50"
                  onClick={() => setDisconnectTargetId(account.id)}
                  disabled={disconnectAccount.isPending}
                >
                  <Unlink className="w-4 h-4 mr-1.5" />
                  連携解除
                </Button>
              </div>
            </div>

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
                      ? 'トークンの有効期限が切れています。自動投稿が停止しています。「トークン更新」をクリックして復旧してください。'
                      : `トークンの有効期限が残り${daysLeft}日です。期限切れになると自動投稿が停止します。早めに更新してください。`
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
                    トークン更新
                  </Button>
                </div>
              ) : null;
            })()}

            {/* Stats */}
            <div className="flex items-center gap-6 flex-wrap text-sm">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-500" />
                <span className="text-muted-foreground">
                  フォロワー: <span className="text-foreground font-medium">{account.followersCount?.toLocaleString() || 0}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-500" />
                <span className="text-muted-foreground">
                  フォロー中: <span className="text-foreground font-medium">{account.followingCount?.toLocaleString() || 0}</span>
                </span>
              </div>
              {account.tokenExpiresAt && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground/60 text-xs">
                    トークン期限: {new Date(account.tokenExpiresAt).toLocaleDateString('ja-JP')}
                  </span>
                </div>
              )}
              {account.lastSyncedAt && (
                <div className="w-full sm:w-auto sm:ml-auto text-muted-foreground/60 text-xs">
                  最終同期: {new Date(account.lastSyncedAt).toLocaleString('ja-JP')}
                </div>
              )}
            </div>
          </div>
        ))}

        {accounts?.length === 0 && (
          <div className="bg-background border border-border border-dashed rounded-xl p-10 text-center">
            <Link2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-foreground font-medium mb-1">まだThreadsアカウントが連携されていません</p>
            <p className="text-muted-foreground/70 text-sm mb-5">
              連携すると、AIで作った投稿をこのアプリから直接投稿・自動投稿できます。
            </p>
            {maxAccounts > 0 ? (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6"
                onClick={handleAddDifferentAccountClick}
                disabled={handleCallback.isPending || !authUrlData}
              >
                <Plus className="w-4 h-4 mr-2" />
                Threadsと連携する
              </Button>
            ) : (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6"
                onClick={() => setLocation('/pricing')}
              >
                プランを選んで連携を始める
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
            全アカウントのトークンを一括更新
          </Button>
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
            {(accounts?.length || 0) > 0 ? '別のThreadsアカウントを連携' : 'Threadsと連携'}
          </Button>
          {(accounts?.length || 0) > 0 && canAddMore && (
            <p className="text-center text-muted-foreground/60 text-xs flex items-center justify-center gap-1">
              <Info className="w-3 h-3" />
              クリックするとThreadsのログイン画面が表示されるので、追加したいアカウントを選んでください
            </p>
          )}
          {!canAddMore && (
            <p className="text-center text-muted-foreground/60 text-sm">
              ※ 新しいアカウントの追加は上限に達していますが、既存アカウントの再連携（トークン更新）は可能です
            </p>
          )}
        </div>
      )}
      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={disconnectTargetId !== null} onOpenChange={() => setDisconnectTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>アカウント連携を解除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              このアカウントの連携を解除すると、予約投稿や自動投稿が停止します。再度連携することで復旧できます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (disconnectTargetId) {
                  disconnectAccount.mutate({ accountId: disconnectTargetId });
                  setDisconnectTargetId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              連携を解除する
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
              同じアカウントが連携されました
            </DialogTitle>
            <DialogDescription className="pt-2 text-foreground/80">
              認証画面で同じアカウントを選んだため、既存連携のトークンが更新されました。
              <br /><br />
              <strong>別のアカウントを追加</strong>するには、もう一度
              「別のThreadsアカウントを連携」をクリックして、Threadsのログイン画面で
              <strong>「別のアカウントでログイン」</strong>を選んでください。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowSameAccountGuide(false)}>
              わかりました
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

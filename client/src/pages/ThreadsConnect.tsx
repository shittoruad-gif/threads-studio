import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { Link2, Unlink, AlertCircle, Plus, User, RefreshCw, Users, ShieldCheck } from 'lucide-react';
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
      console.log('[Threads OAuth] Code extracted from URL:', code.substring(0, 10) + '...');
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
      console.log('[Threads OAuth] Processing callback with code:', oauthCode.substring(0, 10) + '...');
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

  const { data: authUrlData } = trpc.threads.getAuthUrl.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const handleCallback = trpc.threads.handleCallback.useMutation({
    onSuccess: (data) => {
      setIsProcessingCallback(false);
      if (data.isReconnection) {
        toast.success('Threadsアカウントを再連携しました（トークンを更新）');
      } else {
        toast.success('Threadsアカウントを連携しました');
      }
      refetch();
    },
    onError: (error) => {
      setIsProcessingCallback(false);
      console.error('[Threads OAuth] Callback error:', error);
      callbackProcessed.current = false;
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

  const handleConnect = () => {
    if (!authUrlData?.authUrl) {
      toast.error('認証URLを取得できませんでした');
      return;
    }
    window.location.href = authUrlData.authUrl;
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
              <p className="text-gray-700 text-lg font-medium">認証情報を確認中...</p>
              <p className="text-gray-500 text-sm mt-2">しばらくお待ちください</p>
            </>
          ) : (
            <p className="text-gray-500 text-sm">読み込み中...</p>
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
          <p className="text-gray-700 text-lg font-medium">アカウントを連携中...</p>
          <p className="text-gray-500 text-sm mt-2">Threadsとの接続を確立しています</p>
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Threads連携</h1>
        <p className="text-gray-500">
          Threadsアカウントを連携して、直接投稿できるようになります
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-gray-700 text-sm">
            <strong>Threads連携について：</strong> 「Threadsと連携」ボタンをクリックすると、
            ThreadsのOAuth認証画面に移動します。アカウントを認証すると、
            自動的にアカウント情報が取得され、投稿機能が利用可能になります。
          </p>
        </div>
      </div>

      {/* Account Limit */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50">
              <Link2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-gray-900 font-medium">連携アカウント数</p>
              <p className="text-gray-500 text-sm">
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
          <div key={account.id} className="bg-white border border-gray-200 rounded-xl p-6">
            {/* Account Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                {account.profilePictureUrl ? (
                  <img
                    src={account.profilePictureUrl}
                    alt={account.threadsUsername || ''}
                    className="w-14 h-14 rounded-full object-cover border-2 border-gray-100"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                    <User className="w-7 h-7 text-emerald-600" />
                  </div>
                )}
                <div>
                  <p className="text-gray-900 font-semibold text-lg">@{account.threadsUsername}</p>
                  <p className="text-gray-400 text-sm">ID: {account.threadsUserId}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
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
                  onClick={handleConnect}
                  disabled={handleCallback.isPending}
                  title="トークンを更新して再連携"
                >
                  <Link2 className="w-4 h-4 mr-1.5" />
                  再連携
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-gray-600 border-gray-200 hover:bg-gray-50"
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
                  onClick={() => {
                    if (confirm('このアカウントの連携を解除しますか？')) {
                      disconnectAccount.mutate({ accountId: account.id });
                    }
                  }}
                  disabled={disconnectAccount.isPending}
                >
                  <Unlink className="w-4 h-4 mr-1.5" />
                  連携解除
                </Button>
              </div>
            </div>

            {/* Biography */}
            {account.biography && (
              <div className="mb-4 p-3 rounded-lg bg-gray-50">
                <p className="text-gray-700 text-sm">{account.biography}</p>
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
                      ? 'トークンの有効期限が切れています。「トークン更新」または「再連携」で更新してください。'
                      : `トークンの有効期限が残り${daysLeft}日です。`
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
                <span className="text-gray-500">
                  フォロワー: <span className="text-gray-900 font-medium">{account.followersCount?.toLocaleString() || 0}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-500" />
                <span className="text-gray-500">
                  フォロー中: <span className="text-gray-900 font-medium">{account.followingCount?.toLocaleString() || 0}</span>
                </span>
              </div>
              {account.tokenExpiresAt && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs">
                    トークン期限: {new Date(account.tokenExpiresAt).toLocaleDateString('ja-JP')}
                  </span>
                </div>
              )}
              {account.lastSyncedAt && (
                <div className="ml-auto text-gray-400 text-xs">
                  最終同期: {new Date(account.lastSyncedAt).toLocaleString('ja-JP')}
                </div>
              )}
            </div>
          </div>
        ))}

        {accounts?.length === 0 && (
          <div className="bg-white border border-gray-200 border-dashed rounded-xl p-10 text-center">
            <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">まだアカウントが連携されていません</p>
            <p className="text-gray-400 text-sm">下のボタンからThreadsアカウントを連携してください</p>
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

      {/* Connect Button */}
      {maxAccounts > 0 && (
        <div className="space-y-3">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-6 text-base"
            onClick={handleConnect}
            disabled={handleCallback.isPending || !authUrlData}
          >
            <Plus className="w-5 h-5 mr-2" />
            {(accounts?.length || 0) > 0 ? '別のThreadsアカウントを連携' : 'Threadsと連携'}
          </Button>
          {!canAddMore && (
            <p className="text-center text-gray-400 text-sm">
              ※ 新しいアカウントの追加は上限に達していますが、既存アカウントの再連携（トークン更新）は可能です
            </p>
          )}
        </div>
      )}
    </div>
  );
}

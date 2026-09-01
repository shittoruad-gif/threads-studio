import { useState, useEffect } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Sparkles, CheckCircle2, AlertCircle, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { BookmarkButton } from '@/components/BookmarkButton';
import { useLang } from '@/i18n';

export default function Login() {
  const { t, lang, setLang } = useLang();
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const registered = searchParams.includes('registered=true');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showRegisteredMessage, setShowRegisteredMessage] = useState(registered);
  // 紹介コード（ログイン成功時に適用）
  const [couponCode, setCouponCode] = useState('');
  const [showCoupon, setShowCoupon] = useState(false);

  const applyCoupon = trpc.coupon.applyCode.useMutation();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      // ログインに成功したら、紹介コードが入力されていれば適用する。
      // （登録時に入れ損ねた・ログインで詰まったモニターでも確実に反映できる動線）
      const code = couponCode.trim();
      if (code) {
        try {
          const res = await applyCoupon.mutateAsync({ code });
          if (res?.success) {
            toast.success(res.message || 'コードを適用しました', {
              description: res.code ? `適用コード：${res.code}` : `適用コード：${code.toUpperCase()}`,
            });
          } else {
            toast.error(res?.message || 'コードの適用に失敗しました（コードをご確認ください）');
          }
        } catch (e: any) {
          toast.error(e?.message || 'コードの適用に失敗しました');
        }
      }
      // Redirect after successful login.
      // ?redirect= があればそこへ戻す（LIFF初回連携などの往復用。同一オリジンのパスのみ）
      const redirect = new URLSearchParams(searchParams).get('redirect');
      const safe = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/dashboard';
      window.location.href = safe;
    },
    onError: (err) => {
      const msg = err.message;
      // Provide more helpful error messages
      if (msg.includes('メールアドレスまたはパスワードが正しくありません') || msg.includes('Invalid') || msg.includes('incorrect')) {
        setError('メールアドレスまたはパスワードが正しくありません。パスワードを忘れた場合は下のリンクからリセットできます。');
      } else if (msg.includes('rate') || msg.includes('too many')) {
        setError('ログイン試行回数が多すぎます。しばらく待ってから再度お試しください。');
      } else if (msg.includes('verified') || msg.includes('確認')) {
        setError('メールアドレスの確認が完了していません。確認メールをご確認ください。');
      } else {
        setError(msg || 'ログインに失敗しました。もう一度お試しください。');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowRegisteredMessage(false);

    if (!email.trim()) {
      setError('メールアドレスを入力してください');
      return;
    }
    if (!password) {
      setError('パスワードを入力してください');
      return;
    }

    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-6 w-6 text-emerald-600" />
            <CardTitle className="text-2xl font-bold">Threads Studio</CardTitle>
          </div>
          <CardDescription>
            {t('アカウントにログインして、AI投稿生成を始めましょう')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 審査用の英語UIモード切替。日本語UIのまま撮る場合は不要だが、Metaの
              スクリーンキャストのベストプラクティス(英語UI)に合わせたい時にワンタップで切替できる */}
          <div className="flex justify-end -mt-2 -mb-1">
            <button
              type="button"
              onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline"
            >
              {lang === 'ja' ? 'English' : '日本語'}
            </button>
          </div>

          {showRegisteredMessage && (
            <Alert className="border-green-500 bg-green-500/10">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-600">
                {t('アカウントが作成されました！メールアドレスとパスワードでログインしてください。')}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('メールアドレス')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loginMutation.isPending}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('パスワード')}</Label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                  {t('パスワードを忘れた？')}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder={t("パスワードを入力")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loginMutation.isPending}
                autoComplete="current-password"
              />
            </div>

            {/* 紹介コード（任意） */}
            <div className="space-y-2">
              {showCoupon ? (
                <>
                  <Label htmlFor="couponCode" className="flex items-center gap-1.5">
                    <Ticket className="h-3.5 w-3.5 text-emerald-600" />
                    {t("紹介コード（任意）")}
                  </Label>
                  <Input
                    id="couponCode"
                    type="text"
                    placeholder={t("お持ちの方はコードを入力")}
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    disabled={loginMutation.isPending}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("ログインすると、このコードが自動で適用されます（モニターの方はこちらに入力してください）。")}
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCoupon(true)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Ticket className="h-3.5 w-3.5" />
                  {t("紹介コードをお持ちの方")}
                </button>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('ログイン')}
            </Button>
          </form>

        </CardContent>
        <CardFooter className="flex flex-col space-y-3">
          <div className="text-sm text-center text-muted-foreground">
            {t('アカウントをお持ちでないですか？')}{' '}
            <Link href="/register" className="text-primary hover:underline">
              {t('新規登録')}
            </Link>
          </div>
          {/* 次回からすぐ開けるよう、ログイン画面の保存を案内 */}
          <BookmarkButton />
        </CardFooter>
      </Card>
    </div>
  );
}

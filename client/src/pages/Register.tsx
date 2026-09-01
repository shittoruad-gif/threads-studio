import { useState, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Sparkles, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

export default function Register() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [storeName, setStoreName] = useState('');
  // ★LINEなどから ?code=XXX 付きで来た場合は、紹介コード欄に自動で入れておく
  const codeFromUrl = (() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return (params.get('code') || params.get('coupon') || '').trim().toUpperCase().slice(0, 32);
  })();
  const [couponCode, setCouponCode] = useState(codeFromUrl);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState('');

  // #28 紹介コード（?ref=XXX）を URL から取得
  const referralCode = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return (params.get('ref') || '').trim().toUpperCase().slice(0, 16);
  }, []);

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      setLocation('/login?registered=true');
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  // Password strength check（サーバー側 isValidPassword と完全一致させる：
  // 10文字以上 ＋ 英字・数字・記号のうち2種類以上）
  const passwordChecks = useMemo(() => {
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[!@#$%^&*(),.?":{}|<>_\-+=/\\\[\];'`~]/.test(password);
    const kinds = (hasLetter ? 1 : 0) + (hasNumber ? 1 : 0) + (hasSymbol ? 1 : 0);
    return {
      length: password.length >= 10,
      twoKinds: kinds >= 2,
    };
  }, [password]);

  const passwordValid = passwordChecks.length && passwordChecks.twoKinds;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('名前を入力してください');
      return;
    }

    if (!email.trim()) {
      setError('メールアドレスを入力してください');
      return;
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('有効なメールアドレスを入力してください');
      return;
    }

    if (!passwordValid) {
      setError('パスワードの要件を満たしてください');
      return;
    }

    if (!agreedToTerms) {
      setError('利用規約とプライバシーポリシーへの同意が必要です');
      return;
    }

    registerMutation.mutate({
      email,
      password,
      name,
      storeName: storeName.trim() || undefined,
      couponCode: couponCode.trim() || undefined,
      referralCode: referralCode || undefined,
    });
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
            アカウントを作成して、AI投稿生成を始めましょう
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* #28 紹介コード適用中バナー */}
          {referralCode && (
            <Alert className="border-emerald-300 bg-emerald-50">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-emerald-900">
                紹介コード <strong className="font-mono">{referralCode}</strong> が適用されます。
                登録完了で<strong>50ポイント</strong>のボーナスを受け取れます。
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                名前 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="山田太郎"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={registerMutation.isPending}
                autoComplete="name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="storeName">
                店舗名・屋号 <span className="text-muted-foreground text-xs font-normal">（任意・あとで変更できます）</span>
              </Label>
              <Input
                id="storeName"
                type="text"
                placeholder="例：○○整体院"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                disabled={registerMutation.isPending}
                autoComplete="organization"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                メールアドレス <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={registerMutation.isPending}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                パスワード <span className="text-red-500">*</span>
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="パスワードを入力"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={registerMutation.isPending}
                autoComplete="new-password"
              />

              {/* Password strength indicators */}
              {password.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center gap-2">
                    {passwordChecks.length ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                    )}
                    <span className={`text-xs ${passwordChecks.length ? 'text-green-600' : 'text-muted-foreground/60'}`}>
                      10文字以上
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordChecks.twoKinds ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                    )}
                    <span className={`text-xs ${passwordChecks.twoKinds ? 'text-green-600' : 'text-muted-foreground/60'}`}>
                      英字・数字・記号のうち2種類以上を含む
                    </span>
                  </div>
                </div>
              )}

              {password.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  10文字以上で、英字・数字・記号のうち2種類以上を含む必要があります
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="couponCode">
                紹介コード <span className="text-muted-foreground text-xs">（任意）</span>
              </Label>
              <Input
                id="couponCode"
                type="text"
                placeholder="お持ちの方はコードを入力"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                disabled={registerMutation.isPending}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                紹介コードをお持ちの方だけ、こちらにご入力ください（お持ちでない場合は空欄のままで問題ありません）
              </p>
            </div>

            {/* 規約・プライバシーへの明示的な同意（クリックラップ） */}
            <div className="flex items-start gap-2">
              <Checkbox
                id="agree"
                checked={agreedToTerms}
                onCheckedChange={(v) => setAgreedToTerms(v === true)}
                disabled={registerMutation.isPending}
                className="mt-0.5"
              />
              <Label htmlFor="agree" className="text-xs font-normal leading-relaxed text-muted-foreground cursor-pointer">
                <Link href="/terms" className="text-primary hover:underline">利用規約</Link>
                、
                <Link href="/privacy" className="text-primary hover:underline">プライバシーポリシー</Link>
                、
                <Link href="/commercial-transaction" className="text-primary hover:underline">特定商取引法に基づく表記</Link>
                を確認し、同意します。
              </Label>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={registerMutation.isPending || !agreedToTerms}
            >
              {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              アカウント作成
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <div className="text-sm text-center text-muted-foreground">
            既にアカウントをお持ちですか？{' '}
            <Link href="/login" className="text-primary hover:underline">
              ログイン
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

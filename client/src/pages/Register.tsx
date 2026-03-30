import { useState, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Sparkles, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

export default function Register() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      setLocation('/login?registered=true');
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  // Password strength check
  const passwordChecks = useMemo(() => {
    return {
      length: password.length >= 8,
      hasNumber: /\d/.test(password),
      hasSymbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    };
  }, [password]);

  const passwordValid = passwordChecks.length && (passwordChecks.hasNumber || passwordChecks.hasSymbol);

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

    registerMutation.mutate({ email, password, name });
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
                      8文字以上
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordChecks.hasNumber || passwordChecks.hasSymbol ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                    )}
                    <span className={`text-xs ${passwordChecks.hasNumber || passwordChecks.hasSymbol ? 'text-green-600' : 'text-muted-foreground/60'}`}>
                      数字または記号を1つ以上含む
                    </span>
                  </div>
                </div>
              )}

              {password.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  8文字以上で、数字または記号を1つ以上含む必要があります
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              アカウント作成
            </Button>
          </form>

          {/* Terms of Service */}
          <p className="text-xs text-center text-muted-foreground">
            アカウントを作成することで、
            <Link href="/terms" className="text-primary hover:underline">利用規約</Link>
            および
            <Link href="/privacy" className="text-primary hover:underline">プライバシーポリシー</Link>
            に同意したものとみなされます。
          </p>
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

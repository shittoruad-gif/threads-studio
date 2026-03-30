import { useState, useEffect } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Login() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const registered = searchParams.includes('registered=true');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showRegisteredMessage, setShowRegisteredMessage] = useState(registered);

  // Don't auto-hide the registered message - user should see it until they interact
  // (removed the 5 second timer)

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      // Redirect to dashboard after successful login
      window.location.href = '/dashboard';
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
            アカウントにログインして、AI投稿生成を始めましょう
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {showRegisteredMessage && (
            <Alert className="border-green-500 bg-green-500/10">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-600">
                アカウントが作成されました！メールアドレスとパスワードでログインしてください。
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
              <Label htmlFor="email">メールアドレス</Label>
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
                <Label htmlFor="password">パスワード</Label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                  パスワードを忘れた？
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="パスワードを入力"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loginMutation.isPending}
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ログイン
            </Button>
          </form>

        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <div className="text-sm text-center text-muted-foreground">
            アカウントをお持ちでないですか？{' '}
            <Link href="/register" className="text-primary hover:underline">
              新規登録
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

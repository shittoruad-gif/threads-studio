import { useState, useEffect } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Sparkles, CheckCircle2 } from 'lucide-react';

export default function Login() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const registered = searchParams.includes('registered=true');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showRegisteredMessage, setShowRegisteredMessage] = useState(registered);

  useEffect(() => {
    if (registered) {
      const timer = setTimeout(() => setShowRegisteredMessage(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [registered]);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      // Redirect to dashboard after successful login
      window.location.href = '/dashboard';
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
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
              <AlertDescription className="text-green-500">
                アカウントが作成されました。ログインしてください。
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
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

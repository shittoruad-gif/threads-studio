import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Sparkles } from 'lucide-react';

export default function Register() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      // After successful registration, redirect to login
      setLocation('/login?registered=true');
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!name.trim()) {
      setError('名前を入力してください');
      return;
    }
    
    registerMutation.mutate({ email, password, name });
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
            アカウントを作成して、AI投稿生成を始めましょう
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">名前</Label>
              <Input
                id="name"
                type="text"
                placeholder="山田太郎"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={registerMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={registerMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                placeholder="8文字以上、数字または記号を含む"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={registerMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                8文字以上で、数字または記号を1つ以上含む必要があります
              </p>
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

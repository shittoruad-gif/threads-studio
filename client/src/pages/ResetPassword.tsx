import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Sparkles, Lock, Eye, EyeOff, CheckCircle } from "lucide-react";

export default function ResetPassword() {
  const navigate = (path: string) => window.location.href = path;
  const [location] = useLocation();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Get token from URL query parameter
    const params = new URLSearchParams(location.split('?')[1]);
    const tokenParam = params.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    }
  }, [location]);

  const resetPasswordMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    },
    onError: (error) => {
      toast.error(`エラー: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error("無効なリセットトークンです。リンクをもう一度確認してください。");
      return;
    }

    if (!password || !confirmPassword) {
      toast.error("すべてのフィールドを入力してください");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("パスワードが一致しません");
      return;
    }

    if (password.length < 8) {
      toast.error("パスワードは8文字以上で入力してください");
      return;
    }

    resetPasswordMutation.mutate({ token, newPassword: password });
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <Link href="/">
              <div className="inline-flex items-center gap-2 cursor-pointer mb-4">
                <Sparkles className="w-8 h-8 text-primary" />
                <span className="text-2xl font-bold gradient-text">Threads Studio</span>
              </div>
            </Link>
            <h1 className="text-3xl font-bold mb-2">リセット完了</h1>
          </div>

          {/* Success Message */}
          <Card className="glass-card p-8">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
              </div>
              <p className="text-muted-foreground">
                パスワードのリセットが完了しました。
                <br />
                新しいパスワードでログインできます。
              </p>
              <p className="text-sm text-muted-foreground">
                3秒後にログインページに移動します...
              </p>
            </div>

            {/* Login Button */}
            <div className="mt-8">
              <Link href="/login">
                <Button className="w-full neon-border">
                  今すぐログイン
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/">
            <div className="inline-flex items-center gap-2 cursor-pointer mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
              <span className="text-2xl font-bold gradient-text">Threads Studio</span>
            </div>
          </Link>
          <h1 className="text-3xl font-bold mb-2">新しいパスワード設定</h1>
          <p className="text-muted-foreground">
            新しいパスワードを入力してください
          </p>
        </div>

        {/* Reset Password Form */}
        <Card className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">新しいパスワード</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="8文字以上"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                8文字以上、数字または記号を1つ以上含む
              </p>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">パスワード確認</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="もう一度入力"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full neon-border"
              size="lg"
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? "設定中..." : "パスワードを設定"}
            </Button>
          </form>

          {/* Back to Login */}
          <div className="mt-6 text-center text-sm">
            <Link href="/login">
              <a className="text-muted-foreground hover:text-foreground">
                ログインページに戻る
              </a>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

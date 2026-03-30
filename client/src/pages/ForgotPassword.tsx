import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Sparkles, Mail, ArrowLeft, KeyRound, Copy, CheckCircle, AlertTriangle } from "lucide-react";

export default function ForgotPassword() {

  const [email, setEmail] = useState("");
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  const requestResetMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: (data) => {
      if (data.resetToken) {
        // Build the reset URL
        const baseUrl = window.location.origin;
        const link = `${baseUrl}/reset-password?token=${data.resetToken}`;
        setResetLink(link);
        setNotFound(false);
      } else {
        // Email not found or not email auth
        setResetLink(null);
        setNotFound(true);
      }
    },
    onError: (error) => {
      toast.error(`エラー: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResetLink(null);
    setNotFound(false);
    setCopied(false);

    if (!email) {
      toast.error("メールアドレスを入力してください");
      return;
    }

    requestResetMutation.mutate({ email });
  };

  const handleCopy = async () => {
    if (resetLink) {
      try {
        await navigator.clipboard.writeText(resetLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        toast.error('コピーに失敗しました');
      }
    }
  };

  // Show reset link result
  if (resetLink) {
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
            <h1 className="text-3xl font-bold mb-2">パスワードリセット</h1>
          </div>

          {/* Reset Link Display */}
          <Card className="glass-card p-8">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <KeyRound className="w-8 h-8 text-primary" />
                </div>
              </div>
              <p className="text-muted-foreground">
                パスワードリセット用のリンクを生成しました。
                <br />
                下のボタンをクリックしてパスワードを再設定してください。
              </p>
            </div>

            {/* Reset Link Button */}
            <div className="mt-6 space-y-3">
              <Link href={`/reset-password?token=${resetLink.split('token=')[1]}`}>
                <Button className="w-full neon-border" size="lg">
                  パスワードを再設定する
                </Button>
              </Link>

              {/* Copy Link */}
              <Button
                variant="outline"
                className="w-full"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                    コピーしました
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    リンクをコピー
                  </>
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center mt-4">
              リンクの有効期限は1時間です。
            </p>

            {/* Back to Login */}
            <div className="mt-6 text-center">
              <Link href="/login">
                <Button variant="ghost" className="w-full">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  ログインページに戻る
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Show not found message
  if (notFound) {
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
            <h1 className="text-3xl font-bold mb-2">パスワードリセット</h1>
          </div>

          <Card className="glass-card p-8">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-yellow-500" />
                </div>
              </div>
              <p className="text-muted-foreground">
                入力されたメールアドレスに該当するアカウントが見つかりませんでした。
                <br />
                メールアドレスをご確認の上、もう一度お試しください。
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <Button
                className="w-full neon-border"
                onClick={() => {
                  setNotFound(false);
                  setEmail("");
                }}
              >
                もう一度試す
              </Button>
              <Link href="/login">
                <Button variant="ghost" className="w-full">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  ログインページに戻る
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
          <h1 className="text-3xl font-bold mb-2">パスワードリセット</h1>
          <p className="text-muted-foreground">
            登録したメールアドレスを入力してください
          </p>
        </div>

        {/* Reset Request Form */}
        <Card className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full neon-border"
              size="lg"
              disabled={requestResetMutation.isPending}
            >
              {requestResetMutation.isPending ? "確認中..." : "パスワードをリセット"}
            </Button>
          </form>

          {/* Back to Login */}
          <div className="mt-6 text-center text-sm">
            <Link href="/login">
              <a className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" />
                ログインページに戻る
              </a>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

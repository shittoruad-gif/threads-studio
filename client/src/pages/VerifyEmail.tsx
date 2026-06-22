import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Sparkles, CheckCircle, XCircle, Loader2, MailCheck } from "lucide-react";

export default function VerifyEmail() {
  const navigate = (path: string) => window.location.href = path;
  const [token, setToken] = useState("");
  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resent, setResent] = useState(false);

  const resendMutation = trpc.auth.resendVerification.useMutation({
    onSuccess: () => setResent(true),
    onError: () => setResent(true), // メアド列挙防止のため失敗でも同じ表示
  });

  const verifyEmailMutation = trpc.auth.verifyEmail.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setVerifying(false);
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    },
    onError: (err) => {
      setError(err.message);
      setVerifying(false);
    },
  });

  useEffect(() => {
    // クエリ文字列からトークンを取得（wouterのuseLocationはクエリを含まないため
    // window.location.search から直接読む）。
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    if (tokenParam) {
      setToken(tokenParam);
      // Automatically verify
      verifyEmailMutation.mutate({ token: tokenParam });
    } else {
      setError("認証トークンが見つかりません");
      setVerifying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <h1 className="text-3xl font-bold mb-2">メール認証</h1>
        </div>

        {/* Verification Status */}
        <Card className="glass-card p-8">
          {verifying && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <Loader2 className="w-16 h-16 text-primary animate-spin" />
              </div>
              <p className="text-muted-foreground">
                メールアドレスを認証しています...
              </p>
            </div>
          )}

          {!verifying && success && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
              </div>
              <h2 className="text-xl font-bold">認証完了</h2>
              <p className="text-muted-foreground">
                メールアドレスの認証が完了しました。
                <br />
                ログインして利用を開始できます。
              </p>
              <p className="text-sm text-muted-foreground">
                3秒後にログインページに移動します...
              </p>
              <div className="mt-8">
                <Link href="/login">
                  <Button className="w-full neon-border">
                    今すぐログイン
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {!verifying && error && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-red-500" />
                </div>
              </div>
              <h2 className="text-xl font-bold">認証失敗</h2>
              <p className="text-muted-foreground">
                {error}
              </p>

              {/* 認証メールの再送（メールが届かない／リンクが古い場合） */}
              {resent ? (
                <div className="mt-6 rounded-lg bg-green-50 border border-green-200 p-4 text-left flex items-start gap-2">
                  <MailCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-green-700">
                    ご登録のメールアドレス宛に認証メールを送信しました。メールが届かない場合は迷惑メールフォルダもご確認ください。
                  </p>
                </div>
              ) : (
                <div className="mt-6 rounded-lg bg-muted/40 border border-border p-4 text-left space-y-2">
                  <p className="text-sm font-medium text-foreground">認証メールを再送する</p>
                  <p className="text-xs text-muted-foreground">メールが届かない、リンクが古い場合はこちらから再送できます。</p>
                  <Input
                    type="email"
                    placeholder="登録したメールアドレス"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    disabled={resendMutation.isPending || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(resendEmail)}
                    onClick={() => resendMutation.mutate({ email: resendEmail.trim() })}
                  >
                    {resendMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />送信中...</> : '認証メールを再送'}
                  </Button>
                </div>
              )}

              <div className="mt-8 space-y-4">
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    ログイン
                  </Button>
                </Link>
                <Link href="/register">
                  <Button variant="ghost" className="w-full">
                    新規登録はこちら
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

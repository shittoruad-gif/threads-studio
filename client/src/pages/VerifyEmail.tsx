import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Sparkles, CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function VerifyEmail() {
  const navigate = (path: string) => window.location.href = path;
  const [location] = useLocation();
  const [token, setToken] = useState("");
  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

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
    // Get token from URL query parameter
    const params = new URLSearchParams(location.split('?')[1]);
    const tokenParam = params.get('token');
    if (tokenParam) {
      setToken(tokenParam);
      // Automatically verify
      verifyEmailMutation.mutate({ token: tokenParam });
    } else {
      setError("認証トークンが見つかりません");
      setVerifying(false);
    }
  }, [location]);

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
              <div className="mt-8 space-y-4">
                <Link href="/register">
                  <Button className="w-full neon-border">
                    新規登録
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    ログイン
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

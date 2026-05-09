import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Sparkles, Mail, ArrowLeft, MailCheck } from "lucide-react";

/**
 * パスワードリセット申請画面
 *
 * 2026年5月のセキュリティ修正:
 *  - 以前は API がリセットトークンをそのまま返していたため、メアドさえ
 *    知っていれば誰でもアカウント乗っ取り可能だった。
 *  - 修正後はトークンを HTTP レスポンスに含めず、メールでのみ送信。
 *  - メアドの存在/非存在を漏らさないため、画面は常に「メール送信しました」を表示する。
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const requestResetMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => {
      // メアド存在に関わらず常に同じ表示
      setSubmitted(true);
    },
    onError: (error) => {
      toast.error(`エラー: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("メールアドレスを入力してください");
      return;
    }
    requestResetMutation.mutate({ email });
  };

  // 「メール送信しました」画面
  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/">
              <div className="inline-flex items-center gap-2 cursor-pointer mb-4">
                <Sparkles className="w-8 h-8 text-primary" />
                <span className="text-2xl font-bold gradient-text">Threads Studio</span>
              </div>
            </Link>
            <h1 className="text-3xl font-bold mb-2">メールを送信しました</h1>
          </div>

          <Card className="glass-card p-8">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <MailCheck className="w-8 h-8 text-primary" />
                </div>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                ご入力いただいたアドレスにアカウントが存在する場合、
                <br />
                パスワードリセット用のリンクをメールでお送りしました。
              </p>
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 text-left space-y-1">
                <p>📧 メールが見つからない場合：</p>
                <ul className="list-disc list-inside space-y-0.5 pl-1">
                  <li>迷惑メールフォルダもご確認ください</li>
                  <li>noreply@ ドメインからのメールが受信可能か確認</li>
                  <li>メールアドレスのスペル間違いがないか確認</li>
                  <li>リンクの有効期限は1時間です</li>
                </ul>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSubmitted(false);
                  setEmail("");
                }}
              >
                別のメールアドレスで再送
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

        <Card className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="pl-10"
                  required
                  autoFocus
                  disabled={requestResetMutation.isPending}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full neon-border"
              size="lg"
              disabled={requestResetMutation.isPending}
            >
              {requestResetMutation.isPending ? "送信中..." : "リセットメールを送信"}
            </Button>

            <div className="text-center">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  ログインページに戻る
                </Button>
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

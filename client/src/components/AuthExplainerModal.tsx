import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield, CheckCircle2, Lock, Sparkles } from "lucide-react";

interface AuthExplainerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}

export function AuthExplainerModal({ open, onOpenChange, onContinue }: AuthExplainerModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Sparkles className="w-6 h-6 text-primary" />
            Manusアカウントで簡単ログイン
          </DialogTitle>
          <DialogDescription className="text-base pt-4">
            Threads Studioは、Manusプラットフォーム上で動作するアプリケーションです。
            Manusアカウントで安全にログインできます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="glass-card p-4 rounded-lg">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-500" />
              安全なログイン
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <span>業界標準のOAuth 2.0認証を使用</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <span>パスワードは暗号化されて保存</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <span>個人情報は厳重に管理</span>
              </li>
            </ul>
          </div>

          <div className="glass-card p-4 rounded-lg">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-500" />
              Manusアカウントとは？
            </h3>
            <p className="text-sm text-muted-foreground">
              Manusは、AI搭載のビジネスアプリケーションプラットフォームです。
              1つのアカウントで、Threads StudioをはじめとするManusの様々なアプリを利用できます。
            </p>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2 text-sm">次のステップ</h3>
            <ol className="space-y-1 text-sm text-muted-foreground">
              <li>1. Manusログイン画面に移動します</li>
              <li>2. アカウントをお持ちでない場合は、新規登録（無料）</li>
              <li>3. ログイン後、Threads Studioのセットアップを開始</li>
            </ol>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            キャンセル
          </Button>
          <Button onClick={onContinue} className="flex-1 neon-border">
            <Sparkles className="w-4 h-4 mr-2" />
            ログインページへ
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          続行することで、
          <a href="https://manus.im/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            プライバシーポリシー
          </a>
          と
          <a href="https://manus.im/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            利用規約
          </a>
          に同意したものとみなされます。
        </p>
      </DialogContent>
    </Dialog>
  );
}

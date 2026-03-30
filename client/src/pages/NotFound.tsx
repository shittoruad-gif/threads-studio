import { Button } from "@/components/ui/button";
import { Home, LayoutDashboard, ArrowLeft, CreditCard, BookOpen, Sparkles, Link2, FileText, Zap } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { data: user } = trpc.auth.me.useQuery();

  const commonPages = [
    { label: "料金プラン", path: "/pricing", icon: CreditCard },
    { label: "使い方ガイド", path: "/guide", icon: BookOpen },
    { label: "テンプレート", path: "/template-library", icon: FileText },
  ];

  const userPages = [
    { label: "AI投稿作成", path: "/ai-project-create", icon: Sparkles },
    { label: "アカウント連携", path: "/threads-connect", icon: Link2 },
    { label: "投稿履歴", path: "/post-history", icon: FileText },
    { label: "AIテンプレート", path: "/ai-templates", icon: Zap },
  ];

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/50">
      <div className="w-full max-w-2xl mx-4 text-center">
        {/* 404 Number */}
        <div className="mb-6">
          <h1 className="text-[10rem] leading-none font-bold text-emerald-100">
            404
          </h1>
        </div>

        {/* Error Message */}
        <h2 className="text-3xl font-bold text-foreground mb-4">
          ページが見つかりません
        </h2>

        <p className="text-muted-foreground mb-8 text-lg leading-relaxed max-w-md mx-auto">
          お探しのページは存在しないか、移動または削除された可能性があります。
          URLをご確認いただくか、以下のリンクから目的のページへ移動してください。
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button
            onClick={() => setLocation("/")}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-6 text-lg"
          >
            <Home className="w-5 h-5 mr-2" />
            ホームページへ
          </Button>

          {user && (
            <Button
              onClick={() => setLocation("/dashboard")}
              variant="outline"
              className="border-border text-foreground/80 hover:bg-muted px-8 py-6 text-lg"
            >
              <LayoutDashboard className="w-5 h-5 mr-2" />
              ダッシュボードへ
            </Button>
          )}

          <Button
            onClick={() => window.history.back()}
            variant="ghost"
            className="text-muted-foreground hover:text-foreground/80 hover:bg-muted px-8 py-6 text-lg"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            前のページに戻る
          </Button>
        </div>

        {/* Helpful Links */}
        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-muted-foreground/60 text-sm mb-4">よく使われるページ</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {commonPages.map((page) => (
              <Button
                key={page.path}
                variant="ghost"
                onClick={() => setLocation(page.path)}
                className="text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 text-sm gap-1.5"
              >
                <page.icon className="w-3.5 h-3.5" />
                {page.label}
              </Button>
            ))}
            {user && userPages.map((page) => (
              <Button
                key={page.path}
                variant="ghost"
                onClick={() => setLocation(page.path)}
                className="text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 text-sm gap-1.5"
              >
                <page.icon className="w-3.5 h-3.5" />
                {page.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

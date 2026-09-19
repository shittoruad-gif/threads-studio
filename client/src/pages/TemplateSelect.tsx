import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TEMPLATES } from "@shared/templates";
import { ArrowRight, Sparkles, User, LogIn, Crown, Library, EyeOff, RotateCcw, Eye } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import HowToUse from "@/components/HowToUse";

export default function TemplateSelect() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();

  // 使わないテンプレートを非表示にする（ログイン時のみ・削除ではなく戻せる）
  const { data: hiddenItems } = trpc.hidden.list.useQuery(undefined, { enabled: isAuthenticated });
  const hiddenTemplateKeys = new Set(hiddenItems?.template ?? []);
  const [showHidden, setShowHidden] = useState(false);
  const utils = trpc.useUtils();
  const hideMutation = trpc.hidden.hide.useMutation({
    onSuccess: (_data, variables) => {
      utils.hidden.list.invalidate();
      toast.success('テンプレートを非表示にしました', {
        action: { label: '取り消す', onClick: () => unhideMutation.mutate(variables) },
      });
    },
  });
  const unhideMutation = trpc.hidden.unhide.useMutation({
    onSuccess: () => { utils.hidden.list.invalidate(); toast.success('テンプレートを元に戻しました'); },
  });

  const visibleTemplates = TEMPLATES.filter(
    (t) => showHidden || !hiddenTemplateKeys.has(t.id),
  );

  const handleSelectTemplate = (templateId: string) => {
    setLocation(`/studio?template=${templateId}`);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Header Navigation */}
      {/* ★以前は absolute だったため、見出しの「Threads Studio」のバッジに
          そのまま重なっていた（375px ではボタンが3行になり、文字が二重に見える）。
          背景の丸（下の absolute inset-0）とは別なので、流れの中に置いても見た目は変わらない。 */}
      <header className="relative z-50 p-4">
        {/* ★スマホではロゴ＋ボタン3つが横に並びきらない。
            折返しはロゴと nav の間にしか無く、nav の中は 1 行のままだったため、
            375px では「ダッシュボード」が画面の外（右へ170px）に出て押せなかった
            （2026-09-20 夜間整備で実測）。nav の中も折返し、文字を小さくして収める。 */}
        <div className="container flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 text-primary shrink-0" />
            <span className="font-semibold text-lg truncate">Threads Studio</span>
          </div>
          <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground px-2 text-xs sm:px-4 sm:text-sm"
              onClick={() => setLocation('/library')}
            >
              <Library className="w-4 h-4 mr-1 sm:mr-2" />
              ライブラリ
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground px-2 text-xs sm:px-4 sm:text-sm"
              onClick={() => setLocation('/pricing')}
            >
              <Crown className="w-4 h-4 mr-1 sm:mr-2" />
              料金プラン
            </Button>
            {!loading && (
              isAuthenticated ? (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 text-xs sm:px-4 sm:text-sm"
                  onClick={() => setLocation('/dashboard')}
                >
                  <User className="w-4 h-4 mr-1 sm:mr-2" />
                  ダッシュボード
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 text-xs sm:px-4 sm:text-sm"
                  onClick={() => window.location.href = getLoginUrl()}
                >
                  <LogIn className="w-4 h-4 mr-1 sm:mr-2" />
                  ログイン
                </Button>
              )
            )}
          </nav>
        </div>
      </header>
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-primary/20 rounded-full blur-3xl float" style={{animationDelay: '0s'}} />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/30 rounded-full blur-3xl float" style={{animationDelay: '2s'}} />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-secondary/20 rounded-full blur-3xl float" style={{animationDelay: '4s'}} />
      </div>
      
      <div className="container py-12 relative z-10">
        <div className="text-center mb-12 scale-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-primary text-sm font-medium mb-6 hover-lift">
            <Sparkles className="w-4 h-4" />
            Threads Studio
          </div>
          <h1 className="text-6xl font-bold mb-6">
            スレッドテンプレートを選択
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            店舗集客に最適化されたテンプレートから選んで、効果的なThreads投稿を作成しましょう
          </p>
        </div>

        {/* 非表示にしたテンプレートの表示/非表示トグル（ログイン時のみ） */}
        {isAuthenticated && hiddenTemplateKeys.size > 0 && (
          <div className="max-w-5xl mx-auto mb-4 text-right">
            <Button
              variant={showHidden ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs"
              onClick={() => setShowHidden((v) => !v)}
            >
              {showHidden ? <Eye className="h-3.5 w-3.5 mr-1" /> : <EyeOff className="h-3.5 w-3.5 mr-1" />}
              非表示にしたテンプレート {hiddenTemplateKeys.size}件
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {visibleTemplates.map((template, index) => (
            <Card
              key={template.id}
              className="glass-card group hover-lift cursor-pointer overflow-hidden scale-in"
              style={{animationDelay: `${index * 0.1}s`}}
              onClick={() => handleSelectTemplate(template.id)}
            >
              <CardHeader className="relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all" />
                {/* 非表示 / 元に戻す */}
                {isAuthenticated && (
                  <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                    {hiddenTemplateKeys.has(template.id) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-emerald-700"
                        title="元に戻す"
                        onClick={(e) => { e.stopPropagation(); unhideMutation.mutate({ itemType: 'template', itemKey: template.id }); }}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />戻す
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="使わないので非表示にする"
                        onClick={(e) => { e.stopPropagation(); hideMutation.mutate({ itemType: 'template', itemKey: template.id }); }}
                      >
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                )}
                <div className="flex items-start justify-between relative z-10">
                  <div className="text-5xl mb-2 group-hover:scale-110 transition-transform">{template.icon}</div>
                  <ArrowRight className="w-6 h-6 text-muted-foreground group-hover:text-primary group-hover:translate-x-2 transition-all" />
                </div>
                <CardTitle className="text-2xl relative z-10">{template.name}</CardTitle>
                <CardDescription className="text-base">
                  {template.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">必要な情報：</p>
                  <div className="flex flex-wrap gap-2">
                    {template.requiredFields.slice(0, 4).map((field) => (
                      <span
                        key={field.key}
                        className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium"
                      >
                        {field.label}
                      </span>
                    ))}
                    {template.requiredFields.length > 4 && (
                      <span className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
                        +{template.requiredFields.length - 4}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <Button
            variant="outline"
            size="lg"
            onClick={() => setLocation("/library")}
          >
            保存した下書きを見る
          </Button>
        </div>
      </div>

      {/* How to use section */}
      <HowToUse />
    </div>
  );
}

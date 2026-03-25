import { useState } from 'react';
import { Link } from 'wouter';
import { Sparkles, ArrowRight, Loader2, CheckCircle2, Store, Wand2, UserPlus, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { industryTemplates, INDUSTRY_CATEGORIES, type IndustryTemplate } from '@/data/industry-templates';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

/* ─── Step Indicator ─── */
function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = [
    { num: 1, label: '業種を選ぶ', icon: Store },
    { num: 2, label: 'AIが生成', icon: Wand2 },
    { num: 3, label: '登録して自動投稿開始', icon: UserPlus },
  ];

  return (
    <div className="flex items-center justify-center gap-2 md:gap-4 mb-8 md:mb-12">
      {steps.map((step, i) => {
        const Icon = step.icon;
        const isActive = currentStep >= step.num;
        const isCurrent = currentStep === step.num;
        return (
          <div key={step.num} className="flex items-center gap-2 md:gap-4">
            <div className="flex items-center gap-1.5 md:gap-2">
              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                isActive
                  ? 'bg-white text-primary shadow-lg'
                  : 'bg-white/20 text-white/60'
              } ${isCurrent ? 'ring-2 ring-white ring-offset-2 ring-offset-primary/50' : ''}`}>
                {currentStep > step.num ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Icon className="w-4 h-4 md:w-5 md:h-5" />
                )}
              </div>
              <span className={`text-xs md:text-sm font-medium transition-colors ${
                isActive ? 'text-white' : 'text-white/50'
              }`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className={`w-4 h-4 ${isActive ? 'text-white/80' : 'text-white/30'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Post Preview (Threads-style) ─── */
function PostPreview({ result }: { result: GenerateResult }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(result.mainPost);
    setCopied(true);
    toast.success('投稿をコピーしました');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-lg mx-auto">
      <Card className="overflow-hidden shadow-xl border-0">
        {/* Threads-style header */}
        <div className="flex items-center gap-3 p-4 border-b bg-white">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm">あなたのビジネス</p>
            <p className="text-xs text-muted-foreground">たった今</p>
          </div>
        </div>

        {/* Post content */}
        <CardContent className="p-4 bg-white">
          <p className="text-sm leading-relaxed whitespace-pre-wrap mb-3">
            {result.mainPost}
          </p>

          {/* Hashtags */}
          {result.hashtags && result.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {result.hashtags.map((tag: string, i: number) => (
                <span key={i} className="text-xs text-primary/70">
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </span>
              ))}
            </div>
          )}

          {/* Post meta */}
          <div className="flex items-center gap-4 pt-3 border-t text-muted-foreground">
            <span className="text-xs">0 いいね</span>
            <span className="text-xs">0 リプライ</span>
            <span className="text-xs">0 リポスト</span>
          </div>
        </CardContent>

        {/* Copy button */}
        <div className="px-4 pb-4 bg-white">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleCopy}
          >
            {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
            {copied ? 'コピーしました' : '投稿文をコピー'}
          </Button>
        </div>
      </Card>

      {/* AI insights */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {result.goal && (
          <div className="bg-white/80 backdrop-blur rounded-lg p-3 border">
            <p className="text-xs font-medium text-muted-foreground mb-1">投稿の狙い</p>
            <p className="text-sm">{result.goal}</p>
          </div>
        )}
        {result.expectedEffect && (
          <div className="bg-white/80 backdrop-blur rounded-lg p-3 border">
            <p className="text-xs font-medium text-muted-foreground mb-1">期待効果</p>
            <p className="text-sm">{result.expectedEffect}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Types ─── */
interface GenerateResult {
  title: string;
  mainPost: string;
  cta: string;
  hashtags: string[];
  goal: string;
  expectedEffect: string;
}

/* ─── Main Component ─── */
export default function TryGenerate() {
  const [activeCategory, setActiveCategory] = useState<string>(INDUSTRY_CATEGORIES[0].id);
  const [selectedTemplate, setSelectedTemplate] = useState<IndustryTemplate | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  const tryMutation = trpc.project.tryGenerate.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setCurrentStep(3);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleTemplateSelect = (template: IndustryTemplate) => {
    setSelectedTemplate(template);
    setCurrentStep(2);

    // Immediately trigger generation
    tryMutation.mutate({
      businessType: template.businessType,
      area: template.area,
      target: template.target,
      mainProblem: template.mainProblem,
      strength: template.strength,
    });
  };

  const filteredTemplates = industryTemplates.filter(t => t.category === activeCategory);

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-orange-50/30">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b bg-white/90 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold text-foreground">Threads Studio</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">ログイン</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">
                <UserPlus className="w-4 h-4 mr-1" />
                無料登録
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero / Step Area */}
      <div className="pt-16">
        <section className="gradient-hero py-8 md:py-12 px-4">
          <div className="container mx-auto text-center">
            <Badge className="mb-4 bg-white/20 text-white border-white/30 hover:bg-white/30">
              <Sparkles className="w-3 h-3 mr-1" />
              登録不要でお試し
            </Badge>
            <h1 className="text-2xl md:text-4xl font-bold text-white mb-2">
              あなたの業種でAI投稿を体験
            </h1>
            <p className="text-white/80 mb-6 text-sm md:text-base">
              テンプレートを選ぶだけで、AIがThreads投稿を即座に生成します
            </p>
            <StepIndicator currentStep={currentStep} />
          </div>
        </section>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-8 md:py-12">

          {/* Step 1 & 2: Template Selection + Generation */}
          {currentStep < 3 && (
            <div>
              {/* Category Tabs */}
              <div className="flex flex-wrap justify-center gap-2 mb-8">
                {INDUSTRY_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      activeCategory === cat.id
                        ? 'bg-primary text-white shadow-md'
                        : 'bg-white text-muted-foreground hover:bg-orange-50 border'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Template Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 max-w-4xl mx-auto">
                {filteredTemplates.map(template => {
                  const isSelected = selectedTemplate?.id === template.id;
                  const isGenerating = isSelected && tryMutation.isPending;
                  return (
                    <button
                      key={template.id}
                      onClick={() => !tryMutation.isPending && handleTemplateSelect(template)}
                      disabled={tryMutation.isPending}
                      className={`group relative p-4 md:p-5 rounded-xl border-2 text-left transition-all duration-200 ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-lg'
                          : 'border-transparent bg-white hover:border-primary/30 hover:shadow-md'
                      } ${tryMutation.isPending && !isSelected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Store className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`} />
                        <h3 className="font-semibold text-sm">{template.name}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {template.businessType} / {template.area}
                      </p>
                      {isGenerating && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                            <span className="text-xs text-primary font-medium">AI生成中...</span>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Loading overlay for mobile */}
              {tryMutation.isPending && (
                <div className="mt-8 text-center">
                  <div className="inline-flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg border">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span className="text-sm font-medium">AIが投稿を生成しています...</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Result + CTA */}
          {currentStep === 3 && result && (
            <div className="space-y-8">
              {/* Post Preview */}
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-center mb-2">
                  AIが生成した投稿
                </h2>
                <p className="text-center text-muted-foreground text-sm mb-6">
                  {selectedTemplate?.name}向けのThreads投稿が完成しました
                </p>
                <PostPreview result={result} />
              </div>

              {/* CTA Section */}
              <div className="max-w-lg mx-auto">
                <Card className="overflow-hidden border-2 border-primary/20 shadow-xl bg-gradient-to-br from-orange-50 to-white">
                  <CardContent className="p-6 md:p-8 text-center">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="w-7 h-7 text-primary" />
                    </div>
                    <h3 className="text-lg md:text-xl font-bold mb-2">
                      この投稿を保存して自動投稿を始める
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      無料登録すると、投稿の保存・予約投稿・複数アカウント管理など
                      すべての機能をお使いいただけます
                    </p>
                    <div className="space-y-3">
                      <Link href="/register">
                        <Button size="lg" className="w-full text-base py-6 shadow-lg">
                          <UserPlus className="w-5 h-5 mr-2" />
                          無料登録して始める
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </Button>
                      </Link>
                      <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />クレジットカード不要</span>
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />30秒で完了</span>
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />いつでもキャンセル可能</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Try again */}
              <div className="text-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    setResult(null);
                    setSelectedTemplate(null);
                    setCurrentStep(1);
                  }}
                >
                  別の業種で試す
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 px-4 border-t bg-white/50">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className="font-bold text-sm">Threads Studio</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/privacy"><span className="hover:text-foreground cursor-pointer">プライバシーポリシー</span></Link>
            <Link href="/terms"><span className="hover:text-foreground cursor-pointer">利用規約</span></Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

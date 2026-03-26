import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, 
  Zap, 
  Clock, 
  Shield, 
  TrendingUp, 
  Users, 
  CheckCircle2,
  ArrowRight,
  MessageSquare,
  Calendar,
  BarChart3,
  FileText,
  Send,
  Wand2,
  Play,
  Pause,
  RotateCcw,
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  Minus
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useCountUp } from "@/hooks/useCountUp";
import { useState, useEffect, useCallback } from "react";

/* ─── Demo Steps Data ─── */
const demoSteps = [
  {
    step: 1,
    title: "テンプレートを選択",
    description: "業種に合わせたテンプレートを選びます",
    icon: FileText,
    mockUI: {
      type: "template-select" as const,
      templates: [
        { name: "キャンペーン告知", category: "集客", selected: false },
        { name: "新メニュー紹介", category: "商品", selected: true },
        { name: "お客様の声", category: "口コミ", selected: false },
        { name: "スタッフ紹介", category: "信頼", selected: false },
      ]
    }
  },
  {
    step: 2,
    title: "情報を入力",
    description: "テンプレートに必要な情報を入力します",
    icon: Wand2,
    mockUI: {
      type: "form-input" as const,
      fields: [
        { label: "店舗名", value: "リラク整体院 岡山店" },
        { label: "メニュー名", value: "春の肩こり解消コース" },
        { label: "料金", value: "初回限定 3,980円" },
        { label: "特徴", value: "国家資格保有スタッフが施術" },
      ]
    }
  },
  {
    step: 3,
    title: "AIが投稿文を生成",
    description: "入力情報をもとにAIが魅力的な文章を作成",
    icon: Sparkles,
    mockUI: {
      type: "ai-generate" as const,
      generatedText: "\u{1F338} 春の肩こり解消コース 新登場！\n\nデスクワークで凝り固まった肩、放置していませんか？\n\nリラク整体院 岡山店では、国家資格保有スタッフが\nお一人おひとりに合わせた施術をご提供。\n\n\u2728 初回限定 3,980円\n\u{1F4C5} ご予約はDMまたはプロフィールのリンクから\n\n#整体 #肩こり #岡山"
    }
  },
  {
    step: 4,
    title: "投稿を予約・公開",
    description: "日時を指定して予約、または今すぐ投稿",
    icon: Send,
    mockUI: {
      type: "schedule" as const,
      date: "2026年2月10日",
      time: "12:00",
      status: "予約完了"
    }
  }
];

/* ─── Video Demo Section ─── */
function VideoDemoSection() {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.2 });
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [typingIndex, setTypingIndex] = useState(0);

  const stepData = demoSteps[currentStep];

  const advanceStep = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev >= demoSteps.length - 1) {
        setIsPlaying(false);
        return prev;
      }
      setTypingIndex(0);
      return prev + 1;
    });
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setTimeout(advanceStep, 3500);
    return () => clearTimeout(timer);
  }, [isPlaying, currentStep, advanceStep]);

  useEffect(() => {
    if (currentStep !== 2 || !isPlaying) return;
    const mock = demoSteps[2].mockUI;
    if (mock.type !== "ai-generate") return;
    const fullText = mock.generatedText;
    if (typingIndex >= fullText.length) return;
    const timer = setTimeout(() => {
      setTypingIndex((prev) => Math.min(prev + 3, fullText.length));
    }, 20);
    return () => clearTimeout(timer);
  }, [currentStep, typingIndex, isPlaying]);

  const handlePlay = () => { setIsPlaying(true); setHasStarted(true); setCurrentStep(0); setTypingIndex(0); };
  const handlePause = () => { setIsPlaying(false); };
  const handleReset = () => { setIsPlaying(false); setHasStarted(false); setCurrentStep(0); setTypingIndex(0); };

  const renderMockUI = () => {
    const mock = stepData.mockUI;
    if (mock.type === "template-select") {
      return (
        <div className="grid grid-cols-2 gap-3 p-4">
          {mock.templates.map((t, i) => (
            <div key={i} className={`p-3 rounded-lg border-2 transition-all duration-500 ${t.selected ? "border-primary bg-primary/5 scale-105" : "border-border bg-white"}`}>
              <div className="flex items-center gap-2 mb-1">
                <FileText className={`w-4 h-4 ${t.selected ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-sm font-medium ${t.selected ? "text-primary" : "text-foreground"}`}>{t.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">{t.category}</span>
              {t.selected && <div className="mt-1"><CheckCircle2 className="w-4 h-4 text-primary" /></div>}
            </div>
          ))}
        </div>
      );
    }
    if (mock.type === "form-input") {
      return (
        <div className="space-y-3 p-4">
          {mock.fields.map((f, i) => (
            <div key={i} className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">{f.label}</label>
              <div className="bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">{f.value}</div>
            </div>
          ))}
        </div>
      );
    }
    if (mock.type === "ai-generate") {
      const displayText = mock.generatedText.slice(0, typingIndex);
      return (
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-xs text-primary font-medium">AIが生成中...</span>
          </div>
          <div className="bg-muted/30 border border-border rounded-md p-3 text-sm whitespace-pre-wrap min-h-[120px] text-foreground">
            {displayText}
            {typingIndex < mock.generatedText.length && <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5" />}
          </div>
        </div>
      );
    }
    if (mock.type === "schedule") {
      return (
        <div className="p-4 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground font-medium">投稿日</label>
              <div className="bg-muted/50 border border-border rounded-md px-3 py-2 text-sm flex items-center gap-2 text-foreground">
                <Calendar className="w-4 h-4 text-muted-foreground" />{mock.date}
              </div>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground font-medium">投稿時間</label>
              <div className="bg-muted/50 border border-border rounded-md px-3 py-2 text-sm flex items-center gap-2 text-foreground">
                <Clock className="w-4 h-4 text-muted-foreground" />{mock.time}
              </div>
            </div>
          </div>
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-center">
            <CheckCircle2 className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="text-primary font-semibold">{mock.status}</p>
            <p className="text-xs text-muted-foreground mt-1">投稿は指定日時に自動で公開されます</p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <section ref={ref} className="py-24 px-4 bg-muted/30">
      <div className="container mx-auto max-w-5xl">
        <div className={`text-center mb-12 fade-in-up ${isVisible ? 'visible' : ''}`}>
          <span className="section-label mb-3 block">HOW IT WORKS</span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">実際の使い方を見てみましょう</h2>
          <p className="text-muted-foreground text-lg">わずか30秒でThreads投稿が完成する様子をご覧ください</p>
        </div>

        <div className={`relative rounded-2xl overflow-hidden border border-border bg-white shadow-lg fade-in-up delay-200 ${isVisible ? 'visible' : ''}`}>
          {!hasStarted ? (
            <div className="aspect-video bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center">
              <div className="text-center">
                <button onClick={handlePlay} className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 hover:scale-110 hover:bg-primary/20 transition-all cursor-pointer">
                  <Play className="w-10 h-10 text-primary ml-1" />
                </button>
                <p className="text-lg font-medium text-foreground">デモを再生</p>
                <p className="text-sm text-muted-foreground mt-2">テンプレート選択から投稿までの流れ</p>
              </div>
            </div>
          ) : (
            <div className="bg-white">
              <div className="flex items-center justify-between px-6 py-3 border-b border-border">
                <div className="flex items-center gap-4">
                  {demoSteps.map((s, i) => (
                    <button key={i} onClick={() => { setCurrentStep(i); setTypingIndex(0); }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                        i === currentStep ? "bg-primary/10 text-primary" : i < currentStep ? "text-primary" : "text-muted-foreground"
                      }`}>
                      {i < currentStep ? <CheckCircle2 className="w-3.5 h-3.5" /> : (
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border ${
                          i === currentStep ? "border-primary bg-primary text-white" : "border-muted-foreground"
                        }`}>{s.step}</span>
                      )}
                      <span className="hidden sm:inline">{s.title}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={isPlaying ? handlePause : handlePlay} className="p-1.5 rounded-full hover:bg-muted transition-colors">
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button onClick={handleReset} className="p-1.5 rounded-full hover:bg-muted transition-colors">
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-col md:flex-row min-h-[350px]">
                <div className="md:w-1/3 p-6 flex flex-col justify-center border-r border-border">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <stepData.icon className="w-7 h-7 text-primary" />
                  </div>
                  <div className="text-xs text-primary font-semibold mb-1">STEP {stepData.step} / {demoSteps.length}</div>
                  <h3 className="text-xl font-bold mb-2 text-foreground">{stepData.title}</h3>
                  <p className="text-sm text-muted-foreground">{stepData.description}</p>
                  <div className="mt-6 flex gap-1.5">
                    {demoSteps.map((_, i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-500 ${i <= currentStep ? "bg-primary" : "bg-muted"}`} />
                    ))}
                  </div>
                </div>
                <div className="md:w-2/3 p-2">
                  <div className="bg-muted/20 rounded-xl border border-border h-full overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                      <span className="text-[10px] text-muted-foreground ml-2">Threads Studio</span>
                    </div>
                    {renderMockUI()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`grid md:grid-cols-3 gap-6 mt-12 fade-in-up delay-300 ${isVisible ? 'visible' : ''}`}>
          {[
            { value: "30秒", label: "投稿作成時間" },
            { value: "3ステップ", label: "簡単な操作" },
            { value: "0円", label: "無料で始められる" },
          ].map((item, i) => (
            <div key={i} className="clean-card rounded-xl p-6 text-center">
              <div className="text-3xl font-bold text-primary mb-2">{item.value}</div>
              <p className="text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Stats Section ─── */
function StatsSection() {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.3 });
  const stats = [
    { icon: <Users className="w-7 h-7" />, value: 1200, suffix: "+", label: "利用店舗数" },
    { icon: <MessageSquare className="w-7 h-7" />, value: 50000, suffix: "+", label: "月間投稿数" },
    { icon: <TrendingUp className="w-7 h-7" />, value: 98, suffix: "%", label: "満足度" },
    { icon: <Clock className="w-7 h-7" />, value: 90, suffix: "%", label: "時間削減" }
  ];

  return (
    <section ref={ref} className="py-16 px-4 bg-white border-y border-border">
      <div className="container mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <StatCard key={index} stat={stat} isVisible={isVisible} delay={index * 100} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StatCard({ stat, isVisible, delay }: { stat: any; isVisible: boolean; delay: number }) {
  const count = useCountUp({ end: stat.value, isVisible, duration: 2000 });
  return (
    <div className={`text-center fade-in-up`} style={{ transitionDelay: `${delay}ms` }}>
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-3">
        {stat.icon}
      </div>
      <div className="text-3xl md:text-4xl font-bold text-primary mb-1">
        {isVisible ? count.toLocaleString() : 0}{stat.suffix}
      </div>
      <div className="text-muted-foreground text-sm">{stat.label}</div>
    </div>
  );
}

/* ─── FAQ Item ─── */
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-primary font-bold text-sm">Q</span>
          </span>
          <span className="font-medium text-foreground">{question}</span>
        </div>
        {isOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
      </button>
      {isOpen && (
        <div className="px-5 pb-5 pt-0">
          <div className="pl-10 text-muted-foreground text-sm leading-relaxed">{answer}</div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Landing Component ─── */
export default function Landing() {
  const { isAuthenticated, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignupClick = () => {
    if (isAuthenticated) {
      window.location.href = "/dashboard";
    } else {
      window.location.href = "/try";
    }
  };

  const features = [
    { icon: <Sparkles className="w-7 h-7" />, title: "AIアシスト生成", description: "テンプレートを選んで情報を入力するだけで、効果的なThreads投稿が数秒で完成します。" },
    { icon: <Clock className="w-7 h-7" />, title: "予約投稿", description: "最適なタイミングで自動投稿。スケジュール管理で投稿を忘れる心配はありません。" },
    { icon: <Shield className="w-7 h-7" />, title: "安全フィルタ", description: "広告規制・誇大表現を自動で回避。コンプライアンスを守りながら効果的な訴求が可能です。" },
    { icon: <BarChart3 className="w-7 h-7" />, title: "複数アカウント管理", description: "複数のThreadsアカウントを一元管理。店舗ごと、ブランドごとに使い分けられます。" }
  ];

  const problems = [
    { text: "投稿を考えるのに30分以上かかる", icon: <Clock className="w-5 h-5" /> },
    { text: "広告規制が心配で投稿できない", icon: <Shield className="w-5 h-5" /> },
    { text: "投稿を忘れてしまう", icon: <Calendar className="w-5 h-5" /> },
    { text: "複数アカウントの管理が大変", icon: <Users className="w-5 h-5" /> },
  ];

  const reasons = [
    {
      icon: <Sparkles className="w-10 h-10" />, title: "AIが投稿文を自動生成",
      description: "テンプレートを選んで情報を入力するだけで、AIが魅力的な投稿文を自動生成。文章作成が苦手な方でも安心です。",
      benefits: ["投稿作成時間が90%削減", "50種類以上のテンプレート", "業種別に最適化された文章"]
    },
    {
      icon: <Shield className="w-10 h-10" />, title: "安全フィルターでコンプラ安心",
      description: "景品表示法、薬機法、医療広告ガイドラインなどの主要な広告規制に対応。誇大表現や禁止用語を自動で検出します。",
      benefits: ["景品表示法・薬機法対応", "誇大表現の自動検出", "安心して投稿できる"]
    },
    {
      icon: <Clock className="w-10 h-10" />, title: "予約投稿で完全自動化",
      description: "最適なタイミングで自動投稿。事前に複数の投稿を準備しておくことで、投稿を忘れる心配がありません。",
      benefits: ["最大3ヶ月先まで予約可能", "投稿忘れを防止", "最適な時間帯に自動投稿"]
    },
    {
      icon: <Users className="w-10 h-10" />, title: "複数アカウントを一元管理",
      description: "複数のThreadsアカウントを一つのダッシュボードで管理。店舗ごと、ブランドごとにアカウントを使い分けられます。",
      benefits: ["最大20アカウントまで連携", "アカウント切り替えがスムーズ", "複数店舗・複数ブランドに対応"]
    },
    {
      icon: <TrendingUp className="w-10 h-10" />, title: "店舗集客に特化",
      description: "整体院、美容サロン、飲食店など、店舗集客に特化したテンプレートと機能。業種に合わせた最適な投稿ができます。",
      benefits: ["業種別テンプレート", "キャンペーン告知に最適", "地域密着型ビジネス向け"]
    },
    {
      icon: <Zap className="w-10 h-10" />, title: "簡単操作で3分で完成",
      description: "複雑な設定は不要。直感的なインターフェースで、初めての方でもすぐに使いこなせます。",
      benefits: ["直感的なUI/UX", "マニュアル不要", "初心者でも安心"]
    }
  ];

  const faqItems = [
    { question: "無料プランでどこまで使えますか？", answer: "無料プランでは3プロジェクトまで作成可能で、基本的なAI投稿生成機能をご利用いただけます。予約投稿や複数アカウント管理は有料プランでご利用いただけます。" },
    { question: "Threadsアカウントの連携は安全ですか？", answer: "Meta（旧Facebook）の公式OAuth認証を使用しており、お客様のパスワードを当社が保持することはありません。連携はいつでも解除できます。" },
    { question: "どのような業種に対応していますか？", answer: "整体院、美容サロン、飲食店、エステサロン、ネイルサロン、ジム・フィットネス、歯科医院など、幅広い店舗ビジネスに対応したテンプレートをご用意しています。" },
    { question: "解約はいつでもできますか？", answer: "はい、いつでも解約可能です。解約後も契約期間中はサービスをご利用いただけます。解約手数料は一切かかりません。" },
    { question: "投稿の安全フィルタとは何ですか？", answer: "景品表示法、薬機法、医療広告ガイドラインなどの主要な広告規制に基づき、誇大表現や禁止用語を自動で検出・警告する機能です。安心して投稿を公開できます。" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Header ─── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold text-foreground">Threads Studio</span>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">機能</a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">料金</a>
            <a href="#reasons" className="text-sm text-muted-foreground hover:text-foreground transition-colors">選ばれる理由</a>
            <Link href="/guide"><span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">使い方</span></Link>
            <Link href="/pricing">
              <Button variant="outline" size="sm">料金プラン</Button>
            </Link>
            <Button size="sm" onClick={handleSignupClick} disabled={loading}>
              <Sparkles className="w-4 h-4 mr-1" />
              {loading ? "読み込み中..." : isAuthenticated ? "ダッシュボードへ" : "無料で始める"}
            </Button>
          </nav>
          <button className="md:hidden p-2 text-foreground/80 hover:text-foreground transition-colors" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="メニュー">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-white">
            <nav className="container mx-auto px-4 py-4 flex flex-col gap-3">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-sm py-2 hover:text-primary transition-colors">機能</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="text-sm py-2 hover:text-primary transition-colors">料金</a>
              <a href="#reasons" onClick={() => setMobileMenuOpen(false)} className="text-sm py-2 hover:text-primary transition-colors">選ばれる理由</a>
              <Link href="/guide"><span onClick={() => setMobileMenuOpen(false)} className="text-sm py-2 block hover:text-primary transition-colors">使い方</span></Link>
              <Link href="/pricing"><span onClick={() => setMobileMenuOpen(false)} className="text-sm py-2 block hover:text-primary transition-colors">料金プラン</span></Link>
              <div className="pt-2 border-t border-border">
                <Button size="sm" className="w-full" onClick={() => { setMobileMenuOpen(false); handleSignupClick(); }} disabled={loading}>
                  <Sparkles className="w-4 h-4 mr-1" />
                  {loading ? "読み込み中..." : isAuthenticated ? "ダッシュボードへ" : "無料で始める"}
                </Button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* ─── Hero Section ─── */}
      <section className="pt-32 pb-20 px-4 relative overflow-hidden gradient-hero">
        <div className="container mx-auto text-center relative z-10">
          <Badge className="mb-6 bg-white/20 text-white border-white/30 hover:bg-white/30">
            <Sparkles className="w-3 h-3 mr-1" />
            店舗向けThreads投稿自動化ツール
          </Badge>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 text-white leading-tight scale-in">
            テンプレートを選んで<br className="hidden sm:block" />情報を入力するだけ。
          </h1>
          <p className="text-lg md:text-xl text-white/80 mb-4 max-w-3xl mx-auto leading-relaxed">
            整体院・美容サロン・飲食店など、店舗集客に特化したThreads投稿を自動生成
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-10 mt-8">
            <Button size="lg" className="bg-white text-primary hover:bg-white/90 text-lg px-8 py-6 shadow-lg" onClick={handleSignupClick} disabled={loading}>
              <Sparkles className="w-5 h-5 mr-2" />
              {loading ? "読み込み中..." : isAuthenticated ? "ダッシュボードへ" : "無料でAI生成を試す"}
            </Button>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-white/40 text-white hover:bg-white/10 bg-transparent">
                料金プランを見る
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
          
          <div className="flex flex-wrap justify-center gap-6 text-sm text-white/80">
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-white" />クレジットカード不要</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-white" />いつでもキャンセル可能</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-white" />安全フィルタ搭載</div>
          </div>
        </div>

      </section>

      {/* ─── Stats ─── */}
      <StatsSection />

      {/* ─── PROBLEM Section ─── */}
      <section className="py-24 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <span className="section-label mb-3 block">PROBLEM</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">こんなお悩みはありませんか？</h2>
          </div>
          <div className="max-w-2xl mx-auto space-y-4">
            {problems.map((item, index) => (
              <div key={index} className="flex items-center gap-4 bg-white rounded-xl p-5 border border-border shadow-sm">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Minus className="w-5 h-5 text-red-400" />
                </div>
                <span className="text-foreground font-medium">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SOLUTION Section ─── */}
      <section className="py-24 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <span className="section-label mb-3 block">SOLUTION</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">Threads Studioが解決します</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              AIを活用した投稿自動生成と予約投稿で、<br className="hidden sm:block" />
              店舗のSNS運用を効率化します。
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: <Sparkles className="w-8 h-8" />, title: "AIで投稿作成", desc: "テンプレートを選んで情報を入力するだけで、魅力的な投稿文が自動生成されます", color: "bg-primary/10 text-primary" },
              { icon: <Calendar className="w-8 h-8" />, title: "予約投稿", desc: "最適なタイミングで自動投稿。忙しい時間帯でも投稿を忘れません", color: "bg-blue-50 text-blue-600" },
              { icon: <Shield className="w-8 h-8" />, title: "安全フィルタ", desc: "広告規制や誇大表現を自動でチェック。コンプライアンスを守りながら投稿できます", color: "bg-green-50 text-green-600" },
            ].map((item, i) => (
              <div key={i} className="clean-card rounded-xl p-8 text-center">
                <div className={`w-16 h-16 rounded-2xl ${item.color} flex items-center justify-center mx-auto mb-4`}>
                  {item.icon}
                </div>
                <h3 className="font-bold text-lg mb-3 text-foreground">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS Demo ─── */}
      <VideoDemoSection />

      {/* ─── FEATURE Section ─── */}
      <section id="features" className="py-24 px-4 bg-white">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <span className="section-label mb-3 block">FEATURE</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">主な機能</h2>
            <p className="text-muted-foreground text-lg">店舗集客に必要な機能をすべて搭載</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <div key={index} className="clean-card rounded-xl p-6 hover-lift">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <div className="text-primary">{feature.icon}</div>
                </div>
                <h3 className="text-lg font-bold mb-2 text-foreground">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW TO USE Section ─── */}
      <section className="py-24 px-4 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <span className="section-label mb-3 block">HOW TO USE</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">使い方は簡単3ステップ</h2>
            <p className="text-muted-foreground text-lg">誰でもすぐに始められます</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { num: "1", title: "テンプレート選択", desc: "業種・目的に合わせたテンプレートを選択" },
              { num: "2", title: "情報入力", desc: "店舗名、対象、ベネフィットなどを入力" },
              { num: "3", title: "生成・投稿", desc: "スレッドを生成して即座に投稿または予約" },
            ].map((step, i) => (
              <div key={i} className="clean-card rounded-xl p-8 text-center hover-lift">
                <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center mx-auto mb-5">
                  <span className="text-2xl font-bold">{step.num}</span>
                </div>
                <h3 className="text-lg font-bold mb-2 text-foreground">{step.title}</h3>
                <p className="text-muted-foreground text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── POINT Section (Why Choose Us) ─── */}
      <section id="reasons" className="py-24 px-4 bg-white">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <span className="section-label mb-3 block">POINT</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">Threads Studioが選ばれる理由</h2>
            <p className="text-muted-foreground text-lg">店舗集客に必要な機能をすべて揃えています</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {reasons.map((reason, index) => (
              <div key={index} className="clean-card rounded-xl p-6 hover-lift">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <div className="text-primary">{reason.icon}</div>
                </div>
                <h3 className="text-lg font-semibold mb-3 text-foreground">{reason.title}</h3>
                <p className="text-muted-foreground mb-4 text-sm leading-relaxed">{reason.description}</p>
                <ul className="space-y-2">
                  {reason.benefits.map((benefit, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-foreground">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PLAN Section (Pricing Preview) ─── */}
      <section id="pricing" className="py-24 px-4 bg-muted/30">
        <div className="container mx-auto text-center">
          <span className="section-label mb-3 block">PLAN</span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">シンプルな料金プラン</h2>
          <p className="text-muted-foreground mb-12 text-lg">7日間無料トライアルで全機能をお試しいただけます</p>
          
          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-5 max-w-6xl mx-auto mb-12">
            {[
              { name: "無料", price: "￥0", period: "/月", features: ["3プロジェクト", "基本生成機能"], highlight: false },
              { name: "ライト", price: "￥4,980", period: "/月", features: ["50プロジェクト", "1アカウント", "月30投稿"], highlight: false },
              { name: "プロ", price: "￥9,800", period: "/月", features: ["無制限プロジェクト", "3アカウント", "月100投稿"], highlight: true },
              { name: "ビジネス", price: "￥29,800", period: "/月", features: ["複数店舗向け", "10アカウント", "無制限投稿"], highlight: false },
              { name: "代理店", price: "￥55,000", period: "/月", features: ["代理店向け", "20アカウント", "APIアクセス"], highlight: false },
            ].map((plan, i) => (
              <div key={i} className={`rounded-xl p-6 hover-lift ${plan.highlight ? "bg-primary text-white shadow-lg ring-2 ring-primary" : "clean-card"}`}>
                {plan.highlight && <Badge className="mb-2 bg-white/20 text-white border-white/30">人気</Badge>}
                <h3 className={`text-lg font-bold mb-2 ${plan.highlight ? "text-white" : "text-foreground"}`}>{plan.name}</h3>
                <p className={`text-3xl font-bold mb-1 ${plan.highlight ? "text-white" : "text-foreground"}`}>
                  {plan.price}<span className={`text-sm font-normal ${plan.highlight ? "text-white/70" : "text-muted-foreground"}`}>{plan.period}</span>
                </p>
                <ul className="text-left space-y-2 text-sm mt-4">
                  {plan.features.map((f, fi) => (
                    <li key={fi} className="flex items-center gap-2">
                      <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${plan.highlight ? "text-white/80" : "text-primary"}`} />
                      <span className={plan.highlight ? "text-white/90" : "text-foreground"}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          
          <Link href="/pricing">
            <Button size="lg">
              詳しい料金プランを見る
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ─── FAQ Section ─── */}
      <section className="py-24 px-4 bg-white">
        <div className="container mx-auto max-w-3xl">
          <div className="text-center mb-12">
            <span className="section-label mb-3 block">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">よくある質問</h2>
          </div>
          <div className="space-y-3">
            {faqItems.map((item, i) => (
              <FAQItem key={i} question={item.question} answer={item.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="py-20 px-4 gradient-hero">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">まずはお気軽にお試しください</h2>
          <p className="text-lg text-white/80 mb-8 max-w-xl mx-auto">
            クレジットカード不要・いつでもキャンセル可能<br />
            無料プランで基本機能をお試しいただけます
          </p>
          <Button size="lg" className="bg-white text-primary hover:bg-white/90 text-lg px-10 py-6 shadow-lg" onClick={handleSignupClick} disabled={loading}>
            <Sparkles className="w-5 h-5 mr-2" />
            {loading ? "読み込み中..." : isAuthenticated ? "ダッシュボードへ" : "無料でAI生成を試す"}
          </Button>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="py-12 px-4 bg-foreground">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-white font-bold">Threads Studio</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-white/60">
              <Link href="/guide"><span className="hover:text-white/80 transition-colors cursor-pointer">使い方</span></Link>
              <Link href="/pricing"><span className="hover:text-white/80 transition-colors cursor-pointer">料金プラン</span></Link>
              <Link href="/privacy"><span className="hover:text-white/80 transition-colors cursor-pointer">プライバシーポリシー</span></Link>
              <Link href="/terms"><span className="hover:text-white/80 transition-colors cursor-pointer">利用規約</span></Link>
              <Link href="/faq"><span className="hover:text-white/80 transition-colors cursor-pointer">よくある質問</span></Link>
            </div>
            <p className="text-white/40 text-sm">&copy; 2025 Threads Studio. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

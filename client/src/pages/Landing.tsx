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
import { useState, useEffect, useCallback } from "react";

/* ─── Demo Steps Data ───
 * 実際の使い方（2026-09 現在の流れ）。画像はすべて実際のアプリ画面・公式LINEのメニュー。
 * 以前は「テンプレート選択→情報入力→AI生成→予約」という、いまは存在しない流れの
 * 作り物の画面を見せていた（お客様が実物と違うと戸惑う）。
 */
const demoSteps = [
  {
    step: 1,
    title: "会員登録",
    time: "3分",
    description: "お名前・メールアドレス・パスワードだけで登録できます。紹介コードをお持ちの方は、ここで入力します。無料のフリープランから始められます。",
    image: "/demo/register.jpg",
    alt: "Threads Studio の会員登録画面",
    portrait: true,
    caption: "実際の登録画面です",
  },
  {
    step: 2,
    title: "公式LINEを友だち追加して、つなぐ",
    time: "1分",
    description: "登録後に公式LINEを友だち追加し、「登録済みの方はこちら」から会員情報とつなぎます。以降の操作は、このメニューからすべてLINEのトーク内で終わります。",
    image: "/demo/richmenu.jpg",
    alt: "公式LINEのメニュー（今日の投稿・コメント・設定・投稿の成績・固定投稿・お店とアカウント）",
    portrait: false,
    caption: "公式LINEのトーク下部に出る実際のメニューです",
  },
  {
    step: 3,
    title: "「はじめの設定」に答える",
    time: "10〜15分",
    description: "公式LINEのトークで、20問に答えるだけ。お店の情報が登録され、答えた内容だけをAIが事実として使います（書いていない実績や料金が投稿に出ることはありません）。スマホのLINEで進めるのがいちばん簡単です。",
    image: "/demo/counseling-sp.jpg",
    alt: "はじめの設定（20問）の画面",
    portrait: true,
    caption: "実際の画面です（サンプル店舗のデータ）",
  },
  {
    step: 4,
    title: "Threadsアカウントを連携",
    time: "3分",
    description: "セットアップ状況に沿って進めると、残りが一目で分かります。Threadsの連携だけは、パソコンからの操作がおすすめです。",
    image: "/demo/dashboard-sp.jpg",
    alt: "セットアップ状況の画面（アカウント作成・お店の情報・Threads連携・固定投稿）",
    portrait: true,
    caption: "実際の画面です（サンプル店舗のデータ）",
  },
  {
    step: 5,
    title: "毎日、LINEに投稿が届く。押すだけ",
    time: "毎日1タップ",
    description: "実測で反応が高い15時・21時・22時に合わせて、AIが投稿を用意します。公式LINEに届いたカードを見て「これで投稿する」を押すだけ。気に入らなければ「書き直す」「見送る」もその場で。慣れたら確認なしの完全自動にもできます。",
    image: "/demo/line-card.jpg",
    alt: "公式LINEに届く投稿カード（これで投稿する・書き直す・見送る）",
    portrait: false,
    caption: "公式LINEに実際に届くカードです（LINE公式の表示で描画・サンプル店舗の投稿）",
  },
];

/* ─── Video Demo Section ─── */
function VideoDemoSection() {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.2 });
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const stepData = demoSteps[currentStep];

  const advanceStep = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev >= demoSteps.length - 1) {
        setIsPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setTimeout(advanceStep, 6000);
    return () => clearTimeout(timer);
  }, [isPlaying, currentStep, advanceStep]);

  const handlePlay = () => {
    // 切り替え時に画像が遅れて出ないよう、5枚をまとめて先読みする
    for (const st of demoSteps) { const im = new Image(); im.src = st.image; }
    setIsPlaying(true); setHasStarted(true); setCurrentStep(0);
  };
  const handlePause = () => { setIsPlaying(false); };
  const handleReset = () => { setIsPlaying(false); setHasStarted(false); setCurrentStep(0); };

  return (
    <section ref={ref} className="py-24 px-4 bg-muted/30">
      <div className="container mx-auto max-w-5xl">
        <div className={`text-center mb-12 fade-in-up ${isVisible ? 'visible' : ''}`}>
          <span className="section-label mb-3 block">HOW IT WORKS</span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">実際の使い方を見てみましょう</h2>
          <p className="text-muted-foreground text-lg">登録から毎日の投稿まで、実際の画面でご覧ください</p>
        </div>

        <div className={`relative rounded-2xl overflow-hidden border border-border bg-white shadow-lg fade-in-up delay-200 ${isVisible ? 'visible' : ''}`}>
          {!hasStarted ? (
            <div className="aspect-video bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center">
              <div className="text-center">
                <button onClick={handlePlay} className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 hover:scale-110 hover:bg-primary/20 transition-all cursor-pointer" aria-label="デモを再生">
                  <Play className="w-10 h-10 text-primary ml-1" />
                </button>
                <p className="text-lg font-medium text-foreground">デモを再生</p>
                <p className="text-sm text-muted-foreground mt-2">会員登録から、毎日の投稿までの流れ（5ステップ）</p>
              </div>
            </div>
          ) : (
            <div className="bg-white">
              <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border gap-2">
                <div className="flex items-center gap-1.5 md:gap-3 overflow-x-auto">
                  {demoSteps.map((s, i) => (
                    <button key={i} onClick={() => { setCurrentStep(i); }}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer shrink-0 ${
                        i === currentStep ? "bg-primary/10 text-primary" : i < currentStep ? "text-primary" : "text-muted-foreground"
                      }`}>
                      {i < currentStep ? <CheckCircle2 className="w-3.5 h-3.5" /> : (
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[12px] border ${
                          i === currentStep ? "border-primary bg-primary text-white" : "border-muted-foreground"
                        }`}>{s.step}</span>
                      )}
                      <span className="hidden md:inline">{s.title}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={isPlaying ? handlePause : handlePlay} className="p-1.5 rounded-full hover:bg-muted transition-colors" aria-label={isPlaying ? "一時停止" : "再生"}>
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button onClick={handleReset} className="p-1.5 rounded-full hover:bg-muted transition-colors" aria-label="最初から">
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-col md:flex-row min-h-[350px]">
                <div className="md:w-2/5 p-6 flex flex-col justify-center md:border-r border-border">
                  <div className="text-xs text-primary font-semibold mb-1">STEP {stepData.step} / {demoSteps.length}<span className="ml-2 text-muted-foreground font-normal">所要 {stepData.time}</span></div>
                  <h3 className="text-xl font-bold mb-2 text-foreground">{stepData.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{stepData.description}</p>
                  <div className="mt-6 flex gap-1.5">
                    {demoSteps.map((_, i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-500 ${i <= currentStep ? "bg-primary" : "bg-muted"}`} />
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setCurrentStep((p) => Math.max(0, p - 1))}
                      disabled={currentStep === 0}
                      className="text-xs px-3 py-1.5 rounded-md border border-border disabled:opacity-40 hover:bg-muted transition-colors"
                    >前へ</button>
                    <button
                      onClick={() => setCurrentStep((p) => Math.min(demoSteps.length - 1, p + 1))}
                      disabled={currentStep === demoSteps.length - 1}
                      className="text-xs px-3 py-1.5 rounded-md border border-border disabled:opacity-40 hover:bg-muted transition-colors"
                    >次へ</button>
                  </div>
                </div>
                <div className="md:w-3/5 p-3 md:p-4 bg-muted/20">
                  <div className={`mx-auto rounded-xl border border-border bg-white overflow-hidden ${stepData.portrait ? "max-w-[300px]" : "max-w-full"}`}>
                    <img
                      key={stepData.image}
                      src={stepData.image}
                      alt={stepData.alt}
                      className={`w-full h-auto block ${stepData.portrait ? "max-h-[520px] object-cover object-top" : ""}`}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center mt-2">{stepData.caption}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`grid md:grid-cols-3 gap-6 mt-12 fade-in-up delay-300 ${isVisible ? 'visible' : ''}`}>
          {[
            { value: "10〜15分", label: "はじめの設定にかかる時間" },
            { value: "1タップ", label: "毎日の確認はLINEで押すだけ" },
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
    { icon: <Sparkles className="w-7 h-7" />, title: "AIが毎日つくる", description: "はじめに登録したお店の情報だけを事実として使い、AIが毎日の投稿を用意します。届いた投稿を確認して押すだけです。" },
    { icon: <Clock className="w-7 h-7" />, title: "伸びる時間に自動公開", description: "実測で反応が高い15時・21時・22時に合わせて自動で公開。投稿を忘れる心配はありません。" },
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
    { question: "解約はいつでもできますか？", answer: "はい、ダッシュボードからいつでも解約できます。解約後も契約期間中はサービスをご利用いただけます。7日間の無料トライアル中に解約すれば料金は一切発生せず、解約手数料もかかりません。" },
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
            {!isAuthenticated && (
              <Link href="/login">
                <Button variant="ghost" size="sm">ログイン</Button>
              </Link>
            )}
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
              <div className="pt-2 border-t border-border space-y-2">
                {!isAuthenticated && (
                  <Link href="/login">
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setMobileMenuOpen(false)}>
                      ログイン
                    </Button>
                  </Link>
                )}
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
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-white" />登録不要で3回お試し</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-white" />クレジットカード不要</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-white" />安全フィルタ搭載</div>
          </div>
        </div>

      </section>

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
            登録不要・クレジットカード不要<br />
            AI投稿生成を3回まで無料でお試しいただけます
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
              <Link href="/commercial-transaction"><span className="hover:text-white/80 transition-colors cursor-pointer">特定商取引法</span></Link>
            </div>
            <p className="text-white/40 text-sm">&copy; 2026 Threads Studio. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

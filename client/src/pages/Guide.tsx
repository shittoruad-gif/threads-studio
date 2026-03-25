import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  Calendar,
  Shield,
  Users,
  FileText,
  Zap,
  HelpCircle,
  BookOpen,
  Lightbulb,
} from 'lucide-react';
import { getLoginUrl } from '@/const';

export default function Guide() {
  const steps = [
    {
      number: 1,
      title: 'アカウント登録',
      description: 'Threads Studioにログインして、無料トライアルを開始します。',
      details: [
        'メールアドレスまたはSNSアカウントでログイン',
        'クレジットカード登録不要で7日間無料',
        'いつでもキャンセル可能',
      ],
      icon: <Users className="w-8 h-8" />,
    },
    {
      number: 2,
      title: 'Threadsアカウント連携',
      description: 'お使いのThreadsアカウントをThreads Studioに連携します。',
      details: [
        'ダッシュボードから「アカウント連携」をクリック',
        'Threadsの認証画面で許可',
        '複数アカウントの連携も可能（プランによる）',
      ],
      icon: <MessageSquare className="w-8 h-8" />,
    },
    {
      number: 3,
      title: 'プロジェクト作成',
      description: '店舗やブランドごとにプロジェクトを作成して投稿を管理します。',
      details: [
        'プロジェクト名と説明を入力',
        '業種カテゴリーを選択（整体院、美容サロンなど）',
        '複数プロジェクトで異なる店舗を管理可能',
      ],
      icon: <FileText className="w-8 h-8" />,
    },
    {
      number: 4,
      title: 'テンプレート選択',
      description: '業種に合わせた投稿テンプレートを選びます。',
      details: [
        '50種類以上のテンプレートから選択',
        '業種別・目的別に分類',
        'プレビューで完成イメージを確認',
      ],
      icon: <Sparkles className="w-8 h-8" />,
    },
    {
      number: 5,
      title: '情報入力',
      description: 'テンプレートに必要な情報を入力します。',
      details: [
        'キャンペーン内容、料金、期間などを入力',
        'AIが自動で魅力的な文章に変換',
        '安全フィルタで広告規制を自動チェック',
      ],
      icon: <Zap className="w-8 h-8" />,
    },
    {
      number: 6,
      title: '予約投稿設定',
      description: '投稿日時を設定して予約投稿します。',
      details: [
        '日時を指定して予約投稿',
        '即座に投稿することも可能',
        '予約投稿一覧で管理',
      ],
      icon: <Calendar className="w-8 h-8" />,
    },
  ];

  const glossary = [
    {
      term: 'Threads',
      definition:
        'Meta（旧Facebook）が提供するテキストベースのSNSプラットフォーム。Instagramアカウントと連携して利用できます。',
    },
    {
      term: 'プロジェクト',
      definition:
        '店舗やブランドごとに投稿を管理する単位。複数のプロジェクトを作成して、それぞれ異なる投稿テンプレートやスケジュールを設定できます。',
    },
    {
      term: 'テンプレート',
      definition:
        '業種や目的に合わせて用意された投稿の雛形。情報を入力するだけで、効果的な投稿文が自動生成されます。',
    },
    {
      term: '予約投稿',
      definition:
        '指定した日時に自動で投稿する機能。事前に複数の投稿を準備しておくことで、投稿を忘れる心配がありません。',
    },
    {
      term: 'AIアシスト生成',
      definition:
        '入力した情報をもとに、AIが自動で魅力的な投稿文を生成する機能。文章作成が苦手な方でも安心です。',
    },
    {
      term: '安全フィルタ',
      definition:
        '広告規制や誇大表現を自動でチェックする機能。コンプライアンスを守りながら効果的な訴求が可能です。',
    },
    {
      term: '複数アカウント管理',
      definition:
        '複数のThreadsアカウントを一つのダッシュボードで管理する機能。店舗ごと、ブランドごとにアカウントを使い分けられます。',
    },
  ];

  const faqs = [
    {
      question: 'Threadsアカウントを持っていないのですが、使えますか？',
      answer:
        'はい、使えます。ただし、Threads Studioで投稿を作成するには、事前にThreadsアカウントを作成し、連携する必要があります。ThreadsはInstagramアカウントがあれば簡単に始められます。',
    },
    {
      question: '予約投稿はどのくらい先まで設定できますか？',
      answer:
        '最大3ヶ月先まで予約投稿を設定できます。プランによって予約投稿数の上限が異なりますので、料金プランページをご確認ください。',
    },
    {
      question: 'テンプレートは自分でカスタマイズできますか？',
      answer:
        'はい、できます。テンプレートをベースに、自由に文章を編集できます。また、よく使う表現をお気に入りに登録しておくことも可能です。',
    },
    {
      question: '安全フィルタはどのような規制をチェックしますか？',
      answer:
        '景品表示法、薬機法、医療広告ガイドラインなどの主要な広告規制に対応しています。誇大表現や禁止用語を自動で検出し、警告を表示します。',
    },
    {
      question: '複数の店舗を管理できますか？',
      answer:
        'はい、できます。プロジェクト機能を使って店舗ごとに投稿を管理できます。また、プランによっては複数のThreadsアカウントを連携することも可能です。',
    },
    {
      question: '投稿の効果を確認できますか？',
      answer:
        '現在、投稿履歴の確認機能を提供しています。今後、エンゲージメント分析機能も追加予定です。',
    },
    {
      question: 'スマートフォンからも使えますか？',
      answer:
        'はい、使えます。Threads Studioはレスポンシブデザインに対応しており、スマートフォンやタブレットからも快適に利用できます。',
    },
    {
      question: '無料トライアル期間中に解約できますか？',
      answer:
        'はい、できます。無料トライアル期間中はいつでも解約でき、料金は一切発生しません。クレジットカード登録も不要です。',
    },
  ];

  const tips = [
    {
      title: '定期的な投稿を心がける',
      description:
        '週に3〜5回程度の定期的な投稿が効果的です。予約投稿機能を活用して、継続的な情報発信を実現しましょう。',
      icon: <Calendar className="w-5 h-5 text-blue-400" />,
    },
    {
      title: 'お客様との対話を大切に',
      description:
        'Threadsはコミュニケーションツールです。コメントには素早く返信し、お客様との関係を深めましょう。',
      icon: <MessageSquare className="w-5 h-5 text-green-400" />,
    },
    {
      title: 'キャンペーン情報は早めに告知',
      description:
        'セールやイベントの情報は、開催の1〜2週間前から告知を始めると効果的です。',
      icon: <Lightbulb className="w-5 h-5 text-yellow-400" />,
    },
    {
      title: '画像や動画も活用',
      description:
        'テキストだけでなく、店舗の雰囲気が伝わる画像や動画も投稿すると、より多くの反応が得られます。',
      icon: <Sparkles className="w-5 h-5 text-purple-400" />,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-card fixed top-0 left-0 right-0 z-50 border-b border-border/50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <Sparkles className="w-6 h-6 text-primary" />
              <span className="text-xl font-bold gradient-text">Threads Studio</span>
            </div>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                ホーム
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="ghost" size="sm">
                料金プラン
              </Button>
            </Link>
            <a href={getLoginUrl()}>
              <Button size="sm" className="neon-border">
                <Sparkles className="w-4 h-4 mr-2" />
                無料で始める
              </Button>
            </a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-12 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <Badge className="mb-4">
            <BookOpen className="w-3 h-3 mr-1" />
            使い方ガイド
          </Badge>
          <h1 className="text-5xl font-bold mb-6 gradient-text">
            Threads Studioの使い方
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            初めての方でも安心。ステップバイステップで使い方をご説明します。
          </p>
        </div>
      </section>

      {/* Step by Step Guide */}
      <section className="py-12 px-4">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold mb-8 text-center">6ステップで始める</h2>
          <div className="space-y-6">
            {steps.map((step) => (
              <Card key={step.number} className="glass-card p-6 hover-lift">
                <div className="flex gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-2xl">
                      {step.number}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-primary">{step.icon}</div>
                      <h3 className="text-2xl font-semibold">{step.title}</h3>
                    </div>
                    <p className="text-muted-foreground mb-4">{step.description}</p>
                    <ul className="space-y-2">
                      {step.details.map((detail, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Tips Section */}
      <section className="py-12 px-4 bg-muted/30">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold mb-8 text-center">効果的な使い方のコツ</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {tips.map((tip, index) => (
              <Card key={index} className="glass-card p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">{tip.icon}</div>
                  <div>
                    <h3 className="font-semibold mb-2">{tip.title}</h3>
                    <p className="text-sm text-muted-foreground">{tip.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Glossary Section */}
      <section className="py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold mb-8 text-center">用語集</h2>
          <div className="space-y-4">
            {glossary.map((item, index) => (
              <Card key={index} className="glass-card p-6">
                <h3 className="font-semibold text-lg mb-2 text-primary">{item.term}</h3>
                <p className="text-muted-foreground">{item.definition}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-12 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-8">
            <Badge className="mb-4">
              <HelpCircle className="w-3 h-3 mr-1" />
              よくある質問
            </Badge>
            <h2 className="text-3xl font-bold">FAQ</h2>
          </div>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <Card key={index} className="glass-card p-6">
                <h3 className="font-semibold text-lg mb-3 flex items-start gap-2">
                  <HelpCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  {faq.question}
                </h3>
                <p className="text-muted-foreground pl-7">{faq.answer}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-bold mb-6 gradient-text">
            今すぐThreads Studioを始めましょう
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            7日間の無料トライアルで、すべての機能をお試しいただけます
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href={getLoginUrl()}>
              <Button size="lg" className="neon-border text-lg px-8 py-6">
                <Sparkles className="w-5 h-5 mr-2" />
                無料で始める
              </Button>
            </a>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                料金プランを見る
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

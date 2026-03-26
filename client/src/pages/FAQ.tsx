import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, HelpCircle, Search } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSection {
  title: string;
  items: FAQItem[];
}

const faqSections: FAQSection[] = [
  {
    title: "基本的な使い方",
    items: [
      {
        question: "自動投稿はいつされますか？",
        answer:
          "毎日朝6時〜夜21時の間に、設定した頻度で自動投稿されます。",
      },
      {
        question: "投稿頻度を変えたいです",
        answer:
          "ダッシュボードの「自動投稿設定」から変更できます。",
      },
      {
        question: "投稿内容を事前に確認できますか？",
        answer:
          "はい、ダッシュボードの週間カレンダーから予定されている投稿を確認・編集できます。",
      },
    ],
  },
  {
    title: "Threads連携",
    items: [
      {
        question: "Threadsアカウントの連携方法は？",
        answer:
          "サイドバーの「Threads連携」から、Threadsアカウントでログインするだけです。",
      },
      {
        question: "連携が切れた場合は？",
        answer:
          "サイドバーの「Threads連携」から再連携してください。",
      },
      {
        question: "複数のアカウントを連携できますか？",
        answer:
          "はい、プロプラン以上で複数アカウントに対応しています。",
      },
    ],
  },
  {
    title: "料金・プラン",
    items: [
      {
        question: "無料で使えますか？",
        answer:
          "AI生成のお試しは無料です。自動投稿機能は有料プランで利用できます。",
      },
      {
        question: "解約方法は？",
        answer:
          "ダッシュボードの「プラン設定」からいつでも解約できます。",
      },
      {
        question: "プランの違いは？",
        answer:
          "料金プランページで詳細をご確認ください。",
      },
    ],
  },
  {
    title: "投稿について",
    items: [
      {
        question: "広告規制は大丈夫ですか？",
        answer:
          "安全フィルタを搭載しており、誇大表現や薬機法に抵触する表現を自動でチェック・修正します。",
      },
      {
        question: "投稿内容を自分で編集できますか？",
        answer:
          "はい、生成された投稿はすべて編集できます。",
      },
    ],
  },
];

export default function FAQ() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSections = faqSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.answer.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center px-4">
          <Link href="/">
            <span className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <ArrowLeft className="h-4 w-4" />
              トップに戻る
            </span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-orange-600" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">よくある質問</h1>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="質問を検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* FAQ Sections */}
        {filteredSections.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              該当する質問が見つかりませんでした。
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredSections.map((section) => (
              <div key={section.title}>
                <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                  {section.title}
                </h2>
                <div className="rounded-xl border border-border bg-card">
                  <Accordion type="single" collapsible>
                    {section.items.map((item, idx) => (
                      <AccordionItem
                        key={idx}
                        value={`${section.title}-${idx}`}
                        className="px-5"
                      >
                        <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                          {item.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                          {item.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Contact CTA */}
        <div className="mt-12 rounded-xl border border-orange-200 bg-orange-50 p-6 text-center">
          <p className="text-sm text-orange-800 mb-2 font-medium">
            お探しの答えが見つかりませんか？
          </p>
          <p className="text-sm text-orange-600">
            アプリ内のお問い合わせ機能からお気軽にご連絡ください。
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 px-4">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>&copy; 2025 Threads Studio. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy">
              <span className="hover:text-foreground transition-colors cursor-pointer">
                プライバシーポリシー
              </span>
            </Link>
            <Link href="/terms">
              <span className="hover:text-foreground transition-colors cursor-pointer">
                利用規約
              </span>
            </Link>
            <Link href="/">
              <span className="hover:text-foreground transition-colors cursor-pointer">
                トップ
              </span>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

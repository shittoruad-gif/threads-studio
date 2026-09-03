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
import { trpc } from "@/lib/trpc";

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
          "Threadsの実測分析（114アカウント・約3.2万投稿）で反応が高かった時間帯に合わせ、15時台・21時台・22時台に公開されます（1日1回のプランは21時台、1日3回のプランはこの3回）。毎回0〜29分のあいだでランダムにずらします。投稿の実績が8件以上たまると、ご自身の反応が高い時間帯に自動で寄っていきます。お申し込みをした日は、その日の残り時間に合わせてその日の分も投稿されます。",
      },
      {
        question: "スマホやタブレットだけで使えますか？パソコンは必要ですか？",
        answer:
          "スマートフォン・タブレット・パソコンのどれからでも使えます。毎日の確認と承認は公式LINEのトークで終わるのでスマートフォンが便利です。Threadsアカウントの連携だけは、パソコンからの操作をおすすめしています。",
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
          "はい、プロプランは3件、ビジネスプランは10件まで連携できます。",
      },
      {
        question: "地域が違う店舗が複数あります。地域はどう登録すればいいですか？",
        answer:
          "「お店の情報」を店舗ごとに1つずつ登録し（それぞれの地域を書きます）、Threadsアカウントごとに「どのお店の情報を使うか」を紐づけます。これで各アカウントには、その店舗の地域の内容だけが投稿されます。1つのお店の情報に複数の地域をまとめて書くと投稿の地域が混ざるため、おすすめしません。まず1アカウントで試して、あとから店舗とアカウントを増やすこともできます。",
      },
    ],
  },
  {
    title: "料金・プラン",
    items: [
      {
        question: "無料で使えますか？",
        answer:
          "登録不要で、AI投稿生成を3回まで無料でお試しいただけます。その後も無料プランに登録すれば基本機能をご利用いただけます。自動投稿や複数アカウント管理などは有料プランで利用できます。",
      },
      {
        question: "解約方法は？",
        answer:
          "ダッシュボードからいつでも解約できます。解約後も、お支払い済み期間の終了まではサービスをご利用いただけます。7日間の無料トライアル期間中に解約すれば、料金は一切発生しません。",
      },
      {
        question: "プランの違いは？",
        answer:
          "料金プランページで詳細をご確認ください。",
      },
      {
        question: "プランの登録は誰がするのですか？体験中は何を設定すればいいですか？",
        answer:
          "プランのお申し込みは、お客様ご自身がアプリの「料金プラン」画面から行います。弊社が代わりに登録することはありません。無料トライアル中・フリープラン中は、1店舗・1アカウントだけ設定して試していただくのがおすすめです。複数アカウントが必要になったら「料金プラン」からプロプランへ変更してください（設定のやり直しは不要です）。",
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

  // ★お客様から実際にいただいたご質問のうち、掲載を選んだものをここに出す。
  //   （公式LINEに届いたご質問が、そのままこのページに反映される）
  const { data: published } = trpc.support.publishedFaq.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const allSections: FAQSection[] = (() => {
    const rows = published ?? [];
    if (rows.length === 0) return faqSections;
    // 分類ごとにまとめ、既存のセクションがあればそこへ、無ければ新しく作る
    const byCategory = new Map<string, FAQItem[]>();
    for (const r of rows) {
      const key = r.category || "その他";
      const list = byCategory.get(key) ?? [];
      list.push({ question: r.question, answer: r.answer });
      byCategory.set(key, list);
    }
    const merged: FAQSection[] = faqSections.map((sec) => {
      const extra = byCategory.get(sec.title);
      if (!extra) return sec;
      byCategory.delete(sec.title);
      return { ...sec, items: [...sec.items, ...extra] };
    });
    for (const [title, items] of Array.from(byCategory.entries())) {
      merged.push({ title, items });
    }
    return merged;
  })();

  const filteredSections = allSections
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
          <p>&copy; 2026 Threads Studio. All rights reserved.</p>
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

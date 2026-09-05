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
      {
        question: "投稿が来ません",
        answer:
          "次の4つをご確認ください。①自動投稿がONになっているか ②Threadsアカウントがつながっているか ③ご契約のプランに自動投稿が含まれているか（フリープランには自動投稿がありません） ④「お店の情報」の登録が終わっているか。それでも来ない場合は、公式LINEの「担当者に聞く」からお知らせください。",
      },
      {
        question: "届いた投稿の内容を直したいです",
        answer:
          "公式LINEに届いた投稿の「書き直す」を押すと直し方を選べます。ご希望を文章でそのまま送っていただいても直せます（例：「料金の話は入れないで」）。ご自身で打ち直すときは「一部修正」、今回は出したくないときは「見送る」を押してください。",
      },
      {
        question: "間違って投稿してしまいました",
        answer:
          "承認した直後であれば、公式LINEのトークに出る「取り消す」で公開前に戻せます。すでにThreadsへ公開されたあとは、こちらからは取り消せません。お手数ですがThreadsアプリで、その投稿を削除してください（投稿右上の「…」→削除）。",
      },
      {
        question: "写真や動画は入れられますか？",
        answer:
          "いまは文章だけの投稿に対応しています。写真・動画の自動投稿には対応していません。画像を付けたい投稿は、Threadsアプリからご自身で投稿してください。",
      },
      {
        question: "何人まで操作できますか？スタッフも使えますか？",
        answer:
          "1つのご契約を複数の方が公式LINEから操作できます（オーナーと同じく、投稿の確認・承認・設定変更ができます）。人数はフリー・ライトが1人、プロが3人、ビジネスは制限なしです（セミナー価格・モニター価格も同じ）。追加は、公式LINEの「スタッフを追加」で出る6桁のコードを、その方のLINEから送っていただくだけです。",
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
      {
        question: "Threadsのアカウントを持っていません",
        answer:
          "ThreadsのアカウントはInstagramのアカウントから作れます（Threadsアプリを入れて、Instagramでログインするだけです）。Instagramをお持ちでない場合は、先にInstagramのアカウントを作ってください。",
      },
      {
        question: "連携画面から戻ってこられません",
        answer:
          "連携はMeta（Threads）の認証画面を通るため、LINEの中のブラウザではうまく戻れないことがあります。リンクを長押しして「デフォルトのブラウザで開く」を選ぶか、パソコンから連携してください。",
      },
      {
        question: "アカウントごとに設定を変えられますか？",
        answer:
          "はい。2つ以上のアカウントをつないでいる場合、自動投稿のON/OFF・公開前の確認・1日の投稿回数・投稿の長さを、アカウントごとに変えられます。「共通に従う」を選ぶと、全アカウント共通の設定どおりになります。片方のアカウントだけ止める、片方だけ確認あり、といった使い分けができます。",
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
      {
        question: "次回の請求日と金額を知りたいです",
        answer:
          "ホーム画面に、ご契約中のプラン・金額・次回のご請求日が表示されます。公式LINEの「設定」→「プランを見る」からもご確認いただけます。",
      },
      {
        question: "解約するとどうなりますか？",
        answer:
          "フリープランに戻り、毎日の自動投稿は止まります。登録済みの「お店の情報」や、作成・公開済みの投稿はそのまま残ります。Threadsに公開済みの投稿が消えることもありません。またお使いになりたくなったら、料金プランから再開できます（設定のやり直しは不要です）。",
      },
      {
        question: "領収書はもらえますか？",
        answer:
          "領収書は担当者が個別にお出しします。宛名と対象の月をそえて、公式LINEの「担当者に聞く」またはメールでご連絡ください。",
      },
      {
        question: "申し込みボタンを押しても画面が変わりません",
        answer:
          "スマートフォンでポップアップがブロックされていると、お支払い画面が開かないことがあります。ボタンの下に出る「お支払い画面を開く」のリンクを押してみてください。それでも開かない場合は、SafariやChromeなど通常のブラウザで開いてからお試しください。",
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
      {
        question: "連続投稿（ツリー）はできますか？",
        answer:
          "現在はお使いいただけません。連続投稿にはMeta社の追加の許可が必要で、いま審査の承認待ちです。承認されるまでは1投稿（500文字以内）でご利用ください。承認され次第、そのままお使いいただけるようになります。",
      },
      {
        question: "コメントに返信できません",
        answer:
          "コメントへの返信の送信も、Meta社の追加審査の承認待ちです。返信の文案はAIがお作りしますので、文案をコピーしてThreadsアプリから返信してください。承認され次第、アプリと公式LINEからそのまま送れるようにします。",
      },
      {
        question: "投稿の長さは変えられますか？",
        answer:
          "「短め（50〜100字）」「長め（250〜300字）」「交互」から選べます。短めが実測でいちばん見られる長さです。長めは悩みをじっくり書く型に向きますが、表示回数は落ちます。交互を選ぶと、短めと長めを1本ずつ入れ替えて出し、どちらが効くか実データで比べます。設定画面から変更できます。",
      },
      {
        question: "Meta AI呼びかけ投稿とは何ですか？",
        answer:
          "Threadsでは2026年9月から、コメント欄で「@meta.ai」と呼びかけるとMeta AIがコメントで答えるようになりました。Threads Studioは毎日の投稿とは別に、「@meta.ai 新倉敷・玉島で肩こりに悩む人に、整体に通うメリットを伝えて」のような投稿を1日1件、朝〜昼に自動で出します。Meta AIがお店の名前を出して答えるので、投稿の下に会話ができ、届く人が増えます。依頼文は、はじめの設定で登録した地域・お客様像・店名から決まった型で作り、AIには書かせません。止めたいときは「設定」からOFFにできます。",
      },
      {
        question: "Meta AIの返事が付きません",
        answer:
          "@meta.ai はThreadsの仕様で段階的に提供されており、まだ使えないアカウントもあります。その場合、呼びかけ投稿にMeta AIの返事は付きません（投稿自体はそのまま出ます）。使えるようになった時点で、そのまま効き始めます。",
      },
      {
        question: "自分の投稿に @meta.ai の返信が付きました。消せますか？",
        answer:
          "Threadsでは誰でも他の人の投稿の返信欄で @meta.ai を呼べるため、お店の投稿にMeta AIの返信が付くことがあります。消したいときは、その返信を長押しして「非表示」を選んでください。@meta.ai はブロックできませんが、ミュートと「興味がない」は使えます。公式LINEで「Meta AIの返信」と送ると、同じ手順が届きます。",
      },
      {
        question: "昨日どれだけ投稿されたか知りたいです",
        answer:
          "毎朝7時40分に、公式LINEへ「昨日の投稿結果」が届きます。アカウントごとに「公開 3件（ご契約 1日3件）」のように数字で分かり、1件も公開されなかった日は「承認待ち◯件・取り消し◯件」のように理由も一緒に届きます。",
      },
      {
        question: "固定投稿のコメントに付くリンクは、公式LINE以外にできますか？",
        answer:
          "できます。ご案内先は公式LINE・Web予約・ホームページ・その他から登録でき、2つ以上あるときはどこへ案内するかをご自身で選べます。公式LINEの「お店・アカウント」→「ご案内先を選ぶ」、アプリでは誘導用URLの欄の「ここへ案内する」から切り替えられます。固定投稿の締めの言い方も、選んだ先に合わせて変わります。",
      },
    ],
  },
  {
    title: "ログイン・メール",
    items: [
      {
        question: "ログインできません／パスワードを忘れました",
        answer:
          "ログイン画面の「パスワードをお忘れですか？」から再設定できます。ご登録のメールアドレス宛に再設定のリンクをお送りします（1時間有効）。なお、毎日の確認や設定は公式LINEのトークだけでも行えるため、アプリにログインできなくても投稿は止まりません。",
      },
      {
        question: "メールが届きません",
        answer:
          "迷惑メールフォルダをご確認ください。@threads-studio.com からのメールを受け取れる設定になっているかもご確認ください。それでも届かない場合は、ご登録のメールアドレスが違っている可能性があります。公式LINEの「担当者に聞く」からお知らせください。",
      },
      {
        question: "公式LINEの連携ができません",
        answer:
          "公式LINEのトークで「登録済みの方はこちら」を押し、アプリにご登録のメールアドレスを送っていただくと、6桁の番号をメールでお送りします。その番号をトークにそのまま送ってください（10分間有効）。うまくいかないときは、①アプリにご登録のメールアドレスと同じか ②迷惑メールフォルダに入っていないか ③番号の有効期限が切れていないか、をご確認ください。",
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

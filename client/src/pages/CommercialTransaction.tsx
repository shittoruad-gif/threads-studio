import { Link } from "wouter";
import { ArrowLeft, Building2 } from "lucide-react";

export default function CommercialTransaction() {
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
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">特定商取引法に基づく表記</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-8">最終更新日：2026年3月27日</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
          <table className="w-full border-collapse">
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-4 px-4 font-semibold text-foreground bg-muted/50 w-1/3 align-top">販売業者</td>
                <td className="py-4 px-4 text-muted-foreground">
                  株式会社 しっとる
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-foreground bg-muted/50 align-top">代表者名</td>
                <td className="py-4 px-4 text-muted-foreground">
                  大木 和将
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-foreground bg-muted/50 align-top">所在地</td>
                <td className="py-4 px-4 text-muted-foreground">
                  〒700-0901<br />
                  岡山県岡山市北区本町6-36 第一セントラルビル4階
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-foreground bg-muted/50 align-top">電話番号</td>
                <td className="py-4 px-4 text-muted-foreground">
                  請求があった場合に遅滞なく開示します
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-foreground bg-muted/50 align-top">お問い合わせ</td>
                <td className="py-4 px-4 text-muted-foreground">
                  <a
                    href="https://www.shittoru-seo-app.com/%E8%A4%87%E8%A3%BD-%E8%B2%A9%E5%A3%B2%E3%83%91%E3%83%BC%E3%83%88%E3%83%8A%E3%83%BC"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    お問い合わせフォームはこちら
                  </a>
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-foreground bg-muted/50 align-top">サービスURL</td>
                <td className="py-4 px-4 text-muted-foreground">
                  https://threads-studio.com
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-foreground bg-muted/50 align-top">販売価格</td>
                <td className="py-4 px-4 text-muted-foreground">
                  各プランの料金は、<Link href="/pricing"><span className="text-primary hover:underline cursor-pointer">料金プランページ</span></Link>に表示された金額に準じます。
                  <br />
                  すべて税込み価格で表示しています。
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-foreground bg-muted/50 align-top">支払い方法</td>
                <td className="py-4 px-4 text-muted-foreground">
                  クレジットカード決済（Visa、Mastercard、American Express、JCB）
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-foreground bg-muted/50 align-top">支払い時期</td>
                <td className="py-4 px-4 text-muted-foreground">
                  サブスクリプション契約時に初回の決済が行われ、以降は契約期間に応じて自動更新されます。
                  無料トライアル期間がある場合は、トライアル終了後に初回決済が行われます。
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-foreground bg-muted/50 align-top">サービスの提供時期</td>
                <td className="py-4 px-4 text-muted-foreground">
                  お申し込み手続き完了後、直ちにサービスをご利用いただけます。
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-foreground bg-muted/50 align-top">返品・キャンセルについて</td>
                <td className="py-4 px-4 text-muted-foreground">
                  <ul className="list-disc pl-5 space-y-1">
                    <li>デジタルサービスの性質上、お支払い済みの利用料金の返金には原則として応じかねます。</li>
                    <li>サブスクリプションはいつでもキャンセル可能です。キャンセル後も現在の請求期間の終了まではサービスをご利用いただけます。</li>
                    <li>無料トライアル期間中のキャンセルについては、料金は一切発生しません。</li>
                  </ul>
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-foreground bg-muted/50 align-top">動作環境</td>
                <td className="py-4 px-4 text-muted-foreground">
                  <ul className="list-disc pl-5 space-y-1">
                    <li>インターネット接続環境</li>
                    <li>最新版のGoogle Chrome、Safari、Firefox、Microsoft Edge</li>
                    <li>Threads（Meta）のアカウント</li>
                  </ul>
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-semibold text-foreground bg-muted/50 align-top">追加費用</td>
                <td className="py-4 px-4 text-muted-foreground">
                  表示価格以外に、インターネット接続にかかる通信費はお客様のご負担となります。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

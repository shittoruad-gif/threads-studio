import { Link } from "wouter";
import { ArrowLeft, Shield } from "lucide-react";

export default function Privacy() {
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
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">プライバシーポリシー</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-8">最終更新日：2025年2月15日</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. はじめに</h2>
            <p className="text-muted-foreground leading-relaxed">
              Threads Studio（以下「本サービス」）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めます。
              本プライバシーポリシーは、本サービスがどのような情報を収集し、どのように利用・保護するかについて説明します。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. 収集する情報</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              本サービスでは、以下の情報を収集する場合があります。
            </p>
            <div className="space-y-4">
              <div className="pl-4 border-l-2 border-primary/30">
                <h3 className="font-medium text-foreground mb-1">2.1 アカウント情報</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  メールアドレス、ユーザー名、パスワード（暗号化して保存）など、アカウント作成時に提供される情報。
                </p>
              </div>
              <div className="pl-4 border-l-2 border-primary/30">
                <h3 className="font-medium text-foreground mb-1">2.2 Threadsアカウント情報</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Threads APIを通じて取得するThreadsユーザーID、ユーザー名、プロフィール画像URL、アクセストークン。
                  これらはThreads連携機能を提供するために必要です。
                </p>
              </div>
              <div className="pl-4 border-l-2 border-primary/30">
                <h3 className="font-medium text-foreground mb-1">2.3 投稿コンテンツ</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  本サービスを通じて作成・編集された投稿テキスト、画像、テンプレートデータ。
                </p>
              </div>
              <div className="pl-4 border-l-2 border-primary/30">
                <h3 className="font-medium text-foreground mb-1">2.4 利用データ</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  サービスの利用状況、投稿履歴、機能の使用頻度など、サービス改善のために収集する匿名化されたデータ。
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. 情報の利用目的</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              収集した情報は、以下の目的で利用します。
            </p>
            <ul className="space-y-2 text-muted-foreground text-sm">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>本サービスの提供・運営・改善</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Threads APIを通じた投稿の作成・管理・予約投稿の実行</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>ユーザーアカウントの認証・管理</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>カスタマーサポートの提供</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>サービスの安全性確保と不正利用の防止</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>利用状況の分析によるサービス改善</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Threads APIデータの取り扱い</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              本サービスは、Meta社のThreads APIを利用しています。Threads APIを通じて取得したデータについて、以下のとおり取り扱います。
            </p>
            <ul className="space-y-2 text-muted-foreground text-sm">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Threads APIから取得したデータは、本サービスの機能提供のみに使用します</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>アクセストークンは暗号化して安全に保存します</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>第三者にThreads APIデータを販売・共有することはありません</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>ユーザーがThreads連携を解除した場合、関連するThreadsデータを速やかに削除します</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. 情報の共有</h2>
            <p className="text-muted-foreground leading-relaxed">
              本サービスは、以下の場合を除き、ユーザーの個人情報を第三者に提供しません。
            </p>
            <ul className="space-y-2 text-muted-foreground text-sm mt-3">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>ユーザーの同意がある場合</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>法令に基づく開示要求がある場合</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>サービス提供に必要な業務委託先（決済処理のStripe等）に対して、必要最小限の情報を提供する場合</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. データの保存と保護</h2>
            <p className="text-muted-foreground leading-relaxed">
              ユーザーの情報は、適切なセキュリティ対策を講じたサーバーに保存します。
              SSL/TLS暗号化通信、パスワードのハッシュ化、アクセストークンの暗号化など、
              業界標準のセキュリティ対策を実施しています。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. ユーザーの権利</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              ユーザーは以下の権利を有します。
            </p>
            <ul className="space-y-2 text-muted-foreground text-sm">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span><strong className="text-foreground">アクセス権</strong>：自身の個人情報へのアクセスを要求する権利</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span><strong className="text-foreground">訂正権</strong>：不正確な個人情報の訂正を要求する権利</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span><strong className="text-foreground">削除権</strong>：個人情報の削除を要求する権利</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span><strong className="text-foreground">Threads連携解除</strong>：いつでもThreadsアカウントの連携を解除する権利</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. データ削除</h2>
            <p className="text-muted-foreground leading-relaxed">
              ユーザーがアカウントの削除を希望する場合、またはThreads連携を解除する場合、
              関連する個人情報およびThreads APIデータは速やかに削除されます。
              データ削除のリクエストは、アプリ内の設定画面から行うことができます。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Cookieの使用</h2>
            <p className="text-muted-foreground leading-relaxed">
              本サービスでは、ユーザー認証のためにセッションCookieを使用しています。
              これらのCookieは、ログイン状態の維持に必要なものであり、
              トラッキングや広告目的では使用しません。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. 本ポリシーの変更</h2>
            <p className="text-muted-foreground leading-relaxed">
              本プライバシーポリシーは、法令の改正やサービスの変更に伴い、
              予告なく変更される場合があります。重要な変更がある場合は、
              サービス内で通知します。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">11. お問い合わせ</h2>
            <p className="text-muted-foreground leading-relaxed">
              プライバシーに関するご質問やご要望がございましたら、
              アプリ内のお問い合わせ機能またはサポートまでご連絡ください。
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 px-4">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>&copy; 2025 Threads Studio. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/terms"><span className="hover:text-foreground transition-colors cursor-pointer">利用規約</span></Link>
            <Link href="/"><span className="hover:text-foreground transition-colors cursor-pointer">トップ</span></Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

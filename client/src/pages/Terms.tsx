import { Link } from "wouter";
import { ArrowLeft, FileText } from "lucide-react";

export default function Terms() {
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
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">利用規約</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-8">最終更新日：2025年6月1日</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">第1条（適用）</h2>
            <p className="text-muted-foreground leading-relaxed">
              本利用規約（以下「本規約」）は、株式会社しっとる（以下「当社」）が運営するThreads Studio（以下「本サービス」）の利用に関する条件を定めるものです。
              ユーザーは、本サービスを利用することにより、本規約に同意したものとみなされます。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">第2条（サービスの内容）</h2>
            <p className="text-muted-foreground leading-relaxed">
              本サービスは、Meta社のThreads APIを利用して、以下の機能を提供します。
            </p>
            <ul className="space-y-2 text-muted-foreground text-sm mt-3">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Threadsへの投稿の作成・編集・予約投稿</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>AI（人工知能）を活用した投稿コンテンツの自動生成</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>投稿テンプレートの管理・利用</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>投稿履歴の管理・分析</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>複数Threadsアカウントの管理</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>自動投稿スケジューリング</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">第3条（アカウント登録）</h2>
            <div className="space-y-3 text-muted-foreground leading-relaxed">
              <p>
                1. ユーザーは、本サービスを利用するためにアカウントを登録する必要があります。
              </p>
              <p>
                2. ユーザーは、正確かつ最新の情報を提供する義務を負います。
              </p>
              <p>
                3. アカウントの管理責任はユーザーにあり、第三者への貸与・譲渡は禁止します。
              </p>
              <p>
                4. ユーザーのアカウントで行われた全ての行為について、ユーザーが責任を負うものとします。
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">第4条（Threads連携）</h2>
            <div className="space-y-3 text-muted-foreground leading-relaxed">
              <p>
                1. 本サービスの投稿機能を利用するには、Threadsアカウントとの連携（OAuth認証）が必要です。
              </p>
              <p>
                2. 連携により、本サービスはユーザーのThreadsアカウントに対して、
                ユーザーが許可した範囲内でのアクセス権を取得します。
              </p>
              <p>
                3. ユーザーはいつでもThreads連携を解除することができます。
                連携解除後、本サービスはThreadsアカウントへのアクセスを停止し、関連データを削除します。
              </p>
              <p>
                4. Threads APIの利用にはMeta社の利用規約が適用されます。
                ユーザーはMeta社の利用規約も遵守する必要があります。
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">第5条（AI生成機能）</h2>
            <div className="space-y-3 text-muted-foreground leading-relaxed">
              <p>
                1. 本サービスはAI（人工知能）を活用して投稿コンテンツを自動生成する機能を提供します。
              </p>
              <p>
                2. AI生成コンテンツの正確性・適切性・法令適合性について、当社は保証しません。
                投稿前のコンテンツの確認・編集はユーザーの責任で行ってください。
              </p>
              <p>
                3. 本サービスには安全フィルタ機能が搭載されていますが、
                すべての不適切な表現を完全に排除することを保証するものではありません。
              </p>
              <p>
                4. AI生成コンテンツの著作権はユーザーに帰属します。
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">第6条（料金と支払い）</h2>
            <div className="space-y-3 text-muted-foreground leading-relaxed">
              <p>
                1. 本サービスには無料プランと有料プランがあります。
              </p>
              <p>
                2. 有料プランの料金は、サービス内の料金ページに記載されたとおりとします。
              </p>
              <p>
                3. 支払いはStripe社の決済システムを通じて処理されます。
                クレジットカード情報は当社サーバーを経由せず、Stripe社が安全に処理・保管します。
              </p>
              <p>
                4. サブスクリプションは自動更新されます。解約はいつでも可能です。
              </p>
              <p>
                5. 解約後も、支払い済み期間の終了まではサービスをご利用いただけます。
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">第7条（禁止事項）</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              ユーザーは、本サービスの利用にあたり、以下の行為を行ってはなりません。
            </p>
            <ul className="space-y-2 text-muted-foreground text-sm">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>法令または公序良俗に反する行為</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>他のユーザーまたは第三者の権利を侵害する行為</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>スパム、不正アクセス、その他の不正行為</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>本サービスの運営を妨害する行為</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Meta社のThreads利用規約に違反する投稿を行う行為</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>本サービスのリバースエンジニアリング、改ざん、不正利用</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>虚偽情報の投稿、薬機法・景表法等に抵触する広告表現の投稿</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">第8条（免責事項）</h2>
            <div className="space-y-3 text-muted-foreground leading-relaxed">
              <p>
                1. 本サービスは「現状のまま」提供されます。本サービスの完全性、正確性、
                特定目的への適合性について保証するものではありません。
              </p>
              <p>
                2. Threads APIの仕様変更、Meta社のサービス停止等により、
                本サービスの一部または全部が利用できなくなる場合があります。
              </p>
              <p>
                3. AI生成コンテンツの正確性・適切性について、当社は保証しません。
                投稿内容の最終的な確認・判断はユーザーの責任で行ってください。
              </p>
              <p>
                4. 本サービスの利用により生じた損害について、故意または重大な過失がある場合を除き、
                責任を負いません。
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">第9条（サービスの変更・停止）</h2>
            <p className="text-muted-foreground leading-relaxed">
              当社は、事前の通知なく、サービスの内容を変更、追加、または停止する場合があります。
              重要な変更がある場合は、可能な限り事前にユーザーに通知するよう努めます。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">第10条（知的財産権）</h2>
            <div className="space-y-3 text-muted-foreground leading-relaxed">
              <p>
                1. 本サービスに関する知的財産権は、当社に帰属します。
              </p>
              <p>
                2. ユーザーが本サービスを通じて作成したコンテンツ（AI生成コンテンツを含む）の著作権は、ユーザーに帰属します。
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">第11条（規約の変更）</h2>
            <p className="text-muted-foreground leading-relaxed">
              本規約は、必要に応じて変更される場合があります。
              変更後の規約は、本サービス上に掲載した時点で効力を生じるものとします。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">第12条（準拠法・管轄）</h2>
            <p className="text-muted-foreground leading-relaxed">
              本規約の解釈および適用は日本法に準拠するものとし、
              本サービスに関する紛争については、日本国内の裁判所を第一審の専属的合意管轄裁判所とします。
            </p>
          </section>

          <section>
            <p className="text-muted-foreground leading-relaxed">
              運営：株式会社しっとる
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 px-4">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>&copy; 2025 Threads Studio. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy"><span className="hover:text-foreground transition-colors cursor-pointer">プライバシーポリシー</span></Link>
            <Link href="/faq"><span className="hover:text-foreground transition-colors cursor-pointer">よくある質問</span></Link>
            <Link href="/"><span className="hover:text-foreground transition-colors cursor-pointer">トップ</span></Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

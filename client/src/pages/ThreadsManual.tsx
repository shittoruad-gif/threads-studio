import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";

/**
 * クライアント向け使い方マニュアル（公開ページ・ログイン不要）。
 *
 * 「設定が終わったあと、毎日何をすればいいか」を、実際の画面のボタン名と
 * 完全に一致する言葉で説明する。クライアントが運営に質問しなくても
 * 自走できる状態がゴール。URL1本で共有できる。
 *
 * 画面のボタン名を変えたときは、このページの文言も必ず合わせて更新すること。
 */

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 border-l-[3px] border-amber-300 bg-amber-50 px-4 py-3 text-[0.92rem] leading-relaxed text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
      {children}
    </div>
  );
}

function Ui({ children }: { children: React.ReactNode }) {
  return <span className="font-bold text-foreground">「{children}」</span>;
}

function Section({ badge, title, lede, children }: { badge: string; title: string; lede?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border/70 pt-8 first:border-t-0 first:pt-6">
      <span className="mb-2 block font-mono text-[0.78rem] font-bold tracking-wider text-emerald-700 dark:text-emerald-400">
        {badge}
      </span>
      <h2 className="mb-2 text-[1.2rem] font-bold leading-snug text-foreground">{title}</h2>
      {lede && <p className="mb-4 text-sm text-muted-foreground leading-relaxed">{lede}</p>}
      <div className="space-y-4 leading-[1.9] text-foreground/90">{children}</div>
    </section>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-1.5 text-[0.95rem] font-bold text-foreground">Q. {q}</p>
      <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

export default function ThreadsManual() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            アプリへ戻る
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" />
            印刷する
          </Button>
        </div>

        <header className="border-b-2 border-foreground pb-7">
          <p className="mb-3 text-[0.75rem] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
            Threads Studio 使い方マニュアル
          </p>
          <h1 className="mb-4 text-[clamp(1.5rem,4.5vw,2rem)] font-extrabold leading-tight tracking-tight text-foreground text-balance">
            毎日の運用は「見るだけ・押すだけ」
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            投稿はAIが毎日自動で作って公開します（反応が高い15時台・21時台など）。
            あなたがやることは、<strong className="text-foreground">下の①だけ</strong>です。
            あとは週に1回、数字とコメントをのぞけば十分です。
          </p>
        </header>

        <Section
          badge="① 毎日やること（1分）"
          title="投稿を確認して「承認して投稿」を押す"
          lede="「公開前に確認する」設定がONの場合、AIが作った投稿はあなたの承認を待っています。承認しないと公開されないので、1日1回だけ確認してください。"
        >
          <ol className="list-decimal space-y-2 pl-5">
            <li>画面下の <Ui>予約・履歴</Ui> をタップします</li>
            <li>上のほうにある <Ui>承認待ち</Ui> をタップします（件数が表示されています）</li>
            <li>投稿の内容を読んで、問題なければ緑の <Ui>承認して投稿</Ui> を押します。これで完了です</li>
            <li>文章を少し直したいときは <Ui>編集</Ui> → 本文を書き換えて <Ui>保存</Ui> → あらためて <Ui>承認して投稿</Ui></li>
            <li>この投稿はやめたいと思ったら <Ui>キャンセル</Ui> を押します（公開されません）</li>
            <li>投稿の下の <Ui>◯ いい</Ui>／<Ui>✕ 違う</Ui> を押すと、AIがあなたの好みを学びます。◯を押した方向性の投稿は増え、✕を押した方向性は減っていきます（押すだけでOK・公開には影響しません）</li>
          </ol>
          <Note>
            毎回同じ間違い（店名・地域・実績など）が出る場合は、1件ずつ直すより「お店の情報」を直すのが近道です（下の④へ）。
            なお、ホーム画面の設定で「公開前に確認する」を<strong>オフ</strong>にすると、承認なしで全自動公開になり、毎日やることはゼロになります。
          </Note>
        </Section>

        <Section
          badge="② 週1でやること（5分）"
          title="数字とコメントをチェックする"
        >
          <p className="font-bold text-foreground">数字を見る</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>メニューから <Ui>投稿分析</Ui> を開きます</li>
            <li>右上の <Ui>最新データを取得</Ui> を押すと最新の数字になります</li>
            <li>「閲覧数」「いいね」などの合計と、<Ui>当たり投稿 TOP3</Ui> を確認します</li>
            <li>良い投稿には <Ui>文体のお手本に追加</Ui> を押しておくと、今後のAIがその文体を参考にします</li>
          </ol>
          <p className="mt-4 font-bold text-foreground">コメントに返信する</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>メニューから <Ui>コメント管理</Ui> を開きます</li>
            <li>返信したいコメントの <Ui>AI返信を生成</Ui> を押します</li>
            <li>出てきた候補をタップで選び、必要なら手直しして <Ui>投稿する</Ui> を押します</li>
          </ol>
        </Section>

        <Section
          badge="③ 自分でも投稿したいとき（3分）"
          title="目的を選んで「AI投稿を生成」を押すだけ"
          lede="キャンペーン告知など、自動投稿とは別に自分のタイミングで投稿したいときに使います。"
        >
          <ol className="list-decimal space-y-2 pl-5">
            <li>画面下の <Ui>AI投稿</Ui> をタップします</li>
            <li><Ui>投稿の目的を選ぶ</Ui> から1つタップします（迷ったら「予約・LINE登録を増やしたい」でOK）</li>
            <li><Ui>AI投稿を生成</Ui> を押して10〜30秒待ちます</li>
            <li>できた文章を確認します（そのまま書き換えもできます）</li>
            <li>すぐ出すなら <Ui>今すぐThreadsに投稿</Ui> → 確認画面で <Ui>投稿する</Ui>。
              時間を指定するなら <Ui>投稿を予約する</Ui> → 日時を選んで <Ui>予約する</Ui> → <Ui>確定する</Ui></li>
          </ol>
        </Section>

        <Section
          badge="④ お店の情報を直したいとき"
          title="「登録情報を修正」から直す"
          lede="メニュー・料金・強み・営業時間などが変わったときはここで直します。次の自動投稿から反映されます。"
        >
          <ol className="list-decimal space-y-2 pl-5">
            <li>ホーム画面の <Ui>詳しいデータ・その他の機能を見る</Ui> を開き、<Ui>登録情報を修正</Ui> をタップします</li>
            <li>今の回答が一覧で表示されます。直したい項目の <Ui>修正</Ui> を押して書き換え、<Ui>変更を反映</Ui> を押します</li>
            <li>最後に必ず画面下の <Ui>保存する</Ui> を押します（押すまで反映されません）</li>
          </ol>
          <Note>
            もし「はじめの設定」という<strong>空欄の画面</strong>が出ても、入力した内容は消えていません。
            それは「新しい店舗を追加する」画面です。上に出る <Ui>保存済みのお店の情報をひらく</Ui> ボタンを押せば、今までの回答が表示されます。
          </Note>
        </Section>

        <Section
          badge="⑤ 2ヶ月に1回"
          title="Threadsとの接続を延長する"
          lede="Threadsとの接続には60日の有効期限があります。切れると自動投稿が止まりますが、期限が近づくと画面に黄色いお知らせが出るので、そのとき押すだけで大丈夫です。"
        >
          <ol className="list-decimal space-y-2 pl-5">
            <li>メニューから <Ui>Threads連携</Ui> を開きます</li>
            <li>アカウントの <Ui>接続を更新</Ui> を押します（これだけで60日延長されます）</li>
            <li>それでも直らないときだけ <Ui>接続をやり直す</Ui> → Threadsの画面で <Ui>許可</Ui> を押します（この作業はパソコン推奨）</li>
          </ol>
        </Section>

        <Section badge="こまったときは" title="よくある質問">
          <div className="space-y-3">
            <Faq q="入力したお店の情報が消えた？">
              消えていません。サーバーに保存されています。ホームの「詳しいデータ・その他の機能を見る」→「登録情報を修正」を開くと、今までの回答が一覧で表示されます。空欄の画面が出た場合は「保存済みのお店の情報をひらく」ボタンを押してください。
            </Faq>
            <Faq q="投稿が公開されていない">
              いちばん多い原因は「承認待ちのまま」です。「予約・履歴」→「承認待ち」を確認して「承認して投稿」を押してください。次に多いのはThreads接続の期限切れです。「Threads連携」を開いて「接続を更新」を押してください。
            </Faq>
            <Faq q="「失敗」と表示された投稿がある">
              投稿カードに理由が表示されます。「Threads連携を確認」ボタンが出ていればタップして接続を更新、「再試行」が出ていればタップすれば5分後に自動で再投稿されます。
            </Faq>
            <Faq q="ログインできない">
              ログイン画面の「パスワードを忘れた？」から再設定できます。登録したメールアドレスに再設定用のリンクが届きます。
            </Faq>
            <Faq q="画面の表示がおかしい・古い気がする">
              アプリは日々改善されています。ページを一度再読み込み（ブラウザを閉じて開き直す）と最新になります。
            </Faq>
            <Faq q="投稿の時間はなぜ15時や21時なの？">
              114アカウント・12.9万投稿の実測データで、閲覧されやすさが最も高い時間帯（15時台1.25倍・21時台1.24倍）に合わせているためです。変更の必要はありません。
            </Faq>
          </div>
        </Section>

        <section className="mt-14 border border-border bg-card px-5 py-5 sm:px-6">
          <h2 className="mb-2 text-base font-bold text-foreground">それでも解決しないときは</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            アプリ右下の緑の<strong className="text-foreground">「ご要望」ボタン</strong>から送っていただくか、担当者にLINEでご連絡ください。
            「どの画面で・何をしたら・どうなったか」を書いていただけると早く解決できます。
          </p>
        </section>

        <footer className="mt-12 border-t border-border pt-6 text-[0.87rem] text-muted-foreground">
          Threads Studio ／ 株式会社しっとる
        </footer>
      </div>
    </div>
  );
}

import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, ExternalLink, Printer } from "lucide-react";

/**
 * テスター招待方式のクライアント向け設定ガイド（公開ページ・ログイン不要）。
 *
 * 「このURLを1本送るだけ」でクライアントが最後まで進める、タップ進行型。
 * 各STEPに次の画面へ飛ぶボタンを置き、迷いどころ（承諾画面の場所・
 * ログイン3パターン）を先回りで潰す。スマホ前提でボタンは全幅。
 *
 * PDF版（docs/Threads連携かんたんガイド_招待方式.pdf）と内容を同期すること。
 */

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 border-l-[3px] border-amber-300 bg-amber-50 px-4 py-3 text-[0.92rem] leading-relaxed text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
      {children}
    </div>
  );
}

function Ui({ children }: { children: React.ReactNode }) {
  return <span className="font-bold text-foreground">{children}</span>;
}

function Step({ no, time, title, children }: { no: string; time?: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border/70 pt-8 first:border-t-0 first:pt-6">
      <span className="mb-2 flex flex-wrap items-baseline gap-3 font-mono text-[0.78rem] font-bold tracking-wider text-emerald-700 dark:text-emerald-400">
        {no}
        {time && <span className="font-sans font-normal tracking-normal text-muted-foreground">目安 {time}</span>}
      </span>
      <h3 className="mb-4 text-[1.14rem] font-bold leading-snug text-foreground">{title}</h3>
      <div className="space-y-4 leading-[1.9] text-foreground/90">{children}</div>
    </section>
  );
}

/** 次の画面へ飛ぶ全幅ボタン（外部/内部リンク共用） */
function GoButton({ href, external, children }: { href: string; external?: boolean; children: React.ReactNode }) {
  return (
    <Button
      asChild
      className="w-full justify-center bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
    >
      <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
        {external ? <ExternalLink className="ml-1.5 h-4 w-4 shrink-0" /> : <ArrowRight className="ml-1.5 h-4 w-4 shrink-0" />}
      </a>
    </Button>
  );
}

export default function ThreadsInviteGuide() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            トップへ
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" />
            印刷する
          </Button>
        </div>

        <header className="border-b-2 border-foreground pb-7">
          <p className="mb-3 text-[0.75rem] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
            Threads Studio 設定ガイド
          </p>
          <h1 className="mb-4 text-[clamp(1.5rem,4.5vw,2rem)] font-extrabold leading-tight tracking-tight text-foreground text-balance">
            5つのステップで、自動投稿を始める
          </h1>
          <p className="text-muted-foreground">
            このページの<strong className="text-foreground">ボタンを順番にタップしていくだけ</strong>で設定が完了します。
            難しい登録作業はありません。途中でやめても、また続きから進められます。
          </p>
          <p className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-[0.85rem] text-muted-foreground/80">
            <span>所要時間 約15分</span>
            <span>費用 無料（設定作業に料金はかかりません）</span>
            <span>スマホだけでも進められます</span>
          </p>
        </header>

        <Step no="STEP 1" time="1分" title="Threadsのユーザー名を担当者に伝える">
          <ol className="list-decimal space-y-2 pl-5">
            <li>スマホの <Ui>Threads</Ui> アプリで、お店のアカウントのプロフィールを開きます</li>
            <li>名前の下に表示されている<Ui>ユーザー名</Ui>（例：myshop_seitai）をコピーします</li>
            <li>そのユーザー名を、担当者にLINEまたはメールで送ってください</li>
          </ol>
          <Note>
            先頭の「@」は不要です。担当者が招待を送り、「招待をお送りしました」とご連絡します。
            連絡が来たらSTEP 2へ進んでください。
          </Note>
        </Step>

        <Step no="STEP 2" time="2分" title="届いた招待を承諾する">
          <p>
            下のボタンを押すと、Threadsの「ウェブサイトのアクセス許可」画面が開きます
            （<strong className="text-foreground">お店のThreadsアカウント</strong>でログインしてください）。
          </p>
          <GoButton href="https://www.threads.com/settings/website_permissions" external>
            招待の画面を開く（Threads）
          </GoButton>
          <ol className="list-decimal space-y-2 pl-5">
            <li>画面上部のタブから <Ui>招待</Ui> を選びます（最初に開く「アクティブ」は空で正常です）</li>
            <li>「Threads Studio」からの招待が表示されるので、<Ui>承諾</Ui> を押します</li>
          </ol>
          <Note>
            Threadsアプリから開く場合は「設定 → その他の設定 → ウェブサイトのアクセス許可 → 招待」です。
            招待が見当たらないときは、別のアカウントでログインしていないかを確認のうえ、担当者にご連絡ください。
          </Note>
        </Step>

        <Step no="STEP 3" time="2分" title="Threads Studioにログインする">
          <p>ご自身に当てはまるものを1つ選んでタップしてください。</p>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-2 text-[0.95rem] font-bold text-foreground">A. 担当者からログイン情報を受け取った方</p>
              <p className="mb-3 text-[0.88rem] text-muted-foreground">
                お渡ししたメールアドレスとパスワードでログインします。料金のお支払いは不要です（ご契約に含まれています）。
              </p>
              <GoButton href="/login">ログイン画面を開く</GoButton>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-2 text-[0.95rem] font-bold text-foreground">B. 以前ご自身で登録したことがある方</p>
              <p className="mb-3 text-[0.88rem] text-muted-foreground">
                登録時のメールアドレスとパスワードでログインします。パスワードを忘れた場合は下の再設定から。
              </p>
              <div className="space-y-2">
                <GoButton href="/login">ログイン画面を開く</GoButton>
                <Button asChild variant="outline" className="w-full justify-center">
                  <a href="/forgot-password">パスワードを再設定する</a>
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-2 text-[0.95rem] font-bold text-foreground">C. まだ登録していない方</p>
              <p className="mb-3 text-[0.88rem] text-muted-foreground">
                メールアドレスとパスワードを決めて登録します。登録だけでは料金はかかりません（料金プランのお申し込みは、担当者からのご案内に沿って別途行います）。
              </p>
              <GoButton href="/register">無料で始める（新規登録）</GoButton>
            </div>
          </div>
          <Note>
            迷ったら：登録した覚えがなければC。「登録済みです」とエラーが出たらB（パスワード再設定）へ。
          </Note>
        </Step>

        <Step no="STEP 4" time="2分" title="Threadsと連携する">
          <p>ログインできたら、下のボタンで連携画面を開きます。</p>
          <GoButton href="/threads-connect">Threads連携の画面を開く</GoButton>
          <ol className="list-decimal space-y-2 pl-5">
            <li><Ui>Threadsと連携する</Ui> ボタンを押します</li>
            <li>Metaの画面が開くので、<Ui>お店のThreadsアカウント</Ui>（STEP 2で承諾したアカウント）でログインし、<Ui>許可</Ui> を押します</li>
            <li>「連携が完了しました」と表示されたらOKです</li>
          </ol>
          <Note>
            スマホで途中から進めなくなる場合は、Threadsアプリが割り込んでいることが原因です。
            その場合はこのSTEPだけパソコンで行ってください（このページのURLをパソコンで開けば続きから進めます）。
          </Note>
        </Step>

        <Step no="STEP 5" time="10〜15分" title="お店のことを教える（最後のステップ）">
          <p>
            最後に、AIがお店に合った投稿を書けるように、画面の質問に答えてお店のことを教えてください。
            答えた<strong className="text-foreground">事実だけ</strong>を使って投稿が作られます。ここが終われば、翌日から自動投稿が始まります。
          </p>
          <GoButton href="/ai-counseling">お店の情報の入力を始める</GoButton>
          <Note>
            分からない項目は空欄のままでも構いません。あとから設定画面でいつでも直せます。
          </Note>
        </Step>

        <section className="mt-14 border border-border bg-card px-5 py-5 sm:px-6">
          <h2 className="mb-3 text-base font-bold text-foreground">うまくいかないときは</h2>
          <ul className="list-disc space-y-2 pl-5 text-[0.92rem] leading-relaxed text-muted-foreground">
            <li>招待が表示されない → ユーザー名の伝え間違い、または別アカウントでログインしている可能性。担当者へご連絡ください</li>
            <li>「権限がありません」と出る → STEP 2の承諾が済んでいない可能性。招待タブをもう一度ご確認ください</li>
            <li>ログインできない → ログイン画面の「パスワードを忘れた？」から再設定してください</li>
            <li>途中で分からなくなった → 「STEP◯で止まっています」と担当者にお知らせください。その場面からご案内します</li>
          </ul>
        </section>

        <footer className="mt-12 border-t border-border pt-6 text-[0.87rem] text-muted-foreground">
          Threads Studio ／ 株式会社しっとる　｜　ご不明な点はお気軽に担当者までお問い合わせください。
        </footer>
      </div>
    </div>
  );
}

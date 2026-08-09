import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Copy, Check, ArrowLeft, Printer } from "lucide-react";

/**
 * Threads連携の設定手順（公開ページ・ログイン不要）。
 *
 * 代理店やサポートが「このURLを送るだけ」で済むように、ログインなしで開ける。
 * ?mode=direct を付けると、ご自身で申し込むお客様向けに
 * 「登録とお支払い」の章が先頭に加わる。付けない場合（既定）は
 * 代理店からIDを受け取ったお客様向けの内容になる。
 */

const URLS = [
  { key: "redirect", label: "コールバックURLをリダイレクト", value: "https://threads-studio.com/threads-connect" },
  { key: "deauth", label: "コールバックURLをアンインストール", value: "https://threads-studio.com/api/threads/deauthorize" },
  { key: "delete", label: "コールバックURLを削除", value: "https://threads-studio.com/api/threads/data-deletion" },
];

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 border-l-[3px] border-amber-300 bg-amber-50 px-4 py-3 text-[0.92rem] leading-relaxed text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
      {children}
    </div>
  );
}

function Stop({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 border-l-[3px] border-rose-300 bg-rose-50 px-4 py-3 text-[0.92rem] leading-relaxed text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-200">
      {children}
    </div>
  );
}

function Ui({ children }: { children: React.ReactNode }) {
  return <span className="font-bold text-foreground">{children}</span>;
}

function PartHead({ no, title, lede }: { no: string; title: string; lede?: string }) {
  return (
    <div className="mt-14 first:mt-0">
      <div className="flex items-baseline gap-3 border-b-2 border-border pb-3">
        <span className="whitespace-nowrap font-mono text-[0.78rem] font-bold tracking-widest text-emerald-700 dark:text-emerald-400">
          {no}
        </span>
        <h2 className="text-[1.3rem] font-extrabold tracking-tight text-foreground">{title}</h2>
      </div>
      {lede && <p className="mt-3 text-[0.92rem] text-muted-foreground">{lede}</p>}
    </div>
  );
}

function Step({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border/70 pt-8 first:border-t-0 first:pt-6">
      <span className="mb-2 block font-mono text-[0.78rem] font-bold tracking-wider text-muted-foreground">{no}</span>
      <h3 className="mb-4 text-[1.14rem] font-bold leading-snug text-foreground">{title}</h3>
      <div className="space-y-4 leading-[1.9] text-foreground/90">{children}</div>
    </section>
  );
}

export default function ThreadsSetupGuide() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const isDirect = new URLSearchParams(search).get("mode") === "direct";
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* コピー不可の環境では手動選択してもらう */
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 pb-24 pt-12">
        {/* 操作バー（印刷では消える） */}
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
          <h1 className="mb-4 text-[clamp(1.6rem,4.5vw,2.1rem)] font-extrabold leading-tight tracking-tight text-foreground text-balance">
            Threads連携 かんたん設定ガイド
          </h1>
          <p className="text-muted-foreground">
            Threads Studioから、お店のThreadsへ投稿できるようにするための設定です。
            Facebookのアカウントをお持ちでない方でも、この手順どおりに進めれば最後まで完了できます。
            専門知識は必要ありません。
          </p>
          <p className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-[0.85rem] text-muted-foreground/80">
            <span>所要時間 {isDirect ? "40〜50分" : "30〜40分"}</span>
            <span>費用 無料（設定作業に料金はかかりません）</span>
            <span>必要なもの パソコン・スマホ・メールアドレス</span>
          </p>
        </header>

        {/* はじめに */}
        <section className="mt-10 border border-border bg-card px-6 py-6">
          <h2 className="mb-3 text-base font-bold text-foreground">はじめに：これは何をする設定ですか？</h2>
          <p className="mb-3 text-[0.94rem] leading-relaxed text-muted-foreground">
            Threadsに外部のアプリから投稿するには、Threadsを運営しているMeta社に
            <strong className="text-foreground">「投稿を許可する窓口」を1つ登録する</strong>
            という決まりがあります。この手順では、その窓口をお客様のお名前で作り、Threads Studioとつなぎます。
          </p>
          <ul className="mb-3 list-disc space-y-1 pl-5 text-[0.94rem] text-muted-foreground">
            <li>設定するのは<strong className="text-foreground">最初の一度だけ</strong>です</li>
            <li>Meta社への登録に<strong className="text-foreground">費用はかかりません</strong></li>
            <li>途中で分からなくなっても、やり直せます。壊れることはありません</li>
          </ul>
          <p className="text-[0.94rem] leading-relaxed text-muted-foreground">
            Facebookアカウントを作りますが、
            <strong className="text-foreground">Facebookで投稿したり友達を増やしたりする必要はありません</strong>。
            窓口を登録するための「身分証」として使うだけです。
          </p>
        </section>

        {/* 準備 */}
        <section className="mt-6 border border-border bg-card px-6 py-6">
          <h2 className="mb-3 text-base font-bold text-foreground">始める前に確認してください</h2>
          <ul className="list-disc space-y-1 pl-5 text-[0.94rem] text-muted-foreground">
            <li>お店の<strong className="text-foreground">Threadsアカウント</strong>のログイン情報は手元にありますか？</li>
            <li>受信できる<strong className="text-foreground">メールアドレス</strong>はありますか？</li>
            <li><strong className="text-foreground">スマホ</strong>は手元にありますか？（確認コードの受け取りに使います）</li>
            <li>作業は<strong className="text-foreground">パソコン</strong>で行ってください。スマホだけでは途中で進めなくなります</li>
            {!isDirect && (
              <li>担当者からお渡しした<strong className="text-foreground">Threads Studioのログイン情報</strong>はお手元にありますか？</li>
            )}
          </ul>
          <Stop>
            <b>すでにFacebookアカウントをお持ちの方へ：</b>
            新しく作らないでください。Facebookは1人1アカウントが決まりで、2つ目を作るとどちらも停止されることがあります。
            お持ちの方は<strong>第2部</strong>から始めてください。
          </Stop>
        </section>

        {/* ── 直接契約のお客様だけに出す章 ── */}
        {isDirect && (
          <>
            <PartHead no="第 0 部" title="登録とお支払い" lede="ご自身でお申し込みいただく場合の手順です。" />
            <Step no="STEP 0-1" title="アカウントを登録する">
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  <button
                    onClick={() => setLocation("/register")}
                    className="font-bold text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                  >
                    threads-studio.com/register
                  </button>
                  を開きます
                </li>
                <li>お名前・お店の名前・メールアドレス・パスワードを入力します</li>
                <li>登録が終わったら、そのメールアドレスとパスワードでログインします</li>
              </ol>
              <Stop>
                <b>ここで入力したメールアドレスを必ず覚えておいてください。</b>
                次のお支払い画面で<strong>同じメールアドレス</strong>を入力しないと、
                お支払いは完了してもプランが反映されません。
              </Stop>
            </Step>

            <Step no="STEP 0-2" title="プランを選んでお支払いする">
              <ol className="list-decimal space-y-2 pl-5">
                <li>ログインした状態で <Ui>料金プラン</Ui> のページを開きます</li>
                <li>ご希望のプランの <Ui>このプランで始める</Ui> を押します</li>
                <li>お支払いページが新しいタブで開きます</li>
                <li>
                  <strong>メールアドレス欄には、STEP 0-1で登録したものと同じアドレス</strong>を入力します
                </li>
                <li>クレジットカード情報を入力して、お支払いを確定します</li>
              </ol>
              <Note>
                <b>反映されるまで数分かかることがあります。</b>
                お支払い後、Threads Studioの画面を再読み込みすると、プランが切り替わっているかご確認いただけます。
                30分たっても変わらない場合は、担当者までご連絡ください。
              </Note>
            </Step>
          </>
        )}

        {/* ── 第1部 ── */}
        <PartHead
          no="第 1 部"
          title="Facebookアカウントを作る"
          lede="すでにお持ちの方は、ここを飛ばして第2部へ進んでください。"
        />
        <Step no="STEP 1" title="登録画面を開いて、必要事項を入力する">
          <ol className="list-decimal space-y-2 pl-5">
            <li>パソコンのブラウザで <code className="bg-emerald-50 px-1.5 py-0.5 font-mono text-[0.88em] dark:bg-emerald-950/40">facebook.com</code> を開きます</li>
            <li><Ui>新しいアカウントを作成</Ui> という緑色のボタンを押します</li>
            <li>
              次の項目を入力します
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li><strong>姓・名</strong>：ご本人の実名（店名や偽名では登録できません）</li>
                <li><strong>メールアドレスまたは携帯電話番号</strong>：受信できるもの</li>
                <li><strong>新しいパスワード</strong>：忘れないものを設定し、必ずメモしてください</li>
                <li><strong>生年月日・性別</strong>：正しいものを選びます</li>
              </ul>
            </li>
            <li><Ui>アカウントを登録</Ui> を押します</li>
          </ol>
          <Note>
            <b>実名で登録してください。</b>
            Facebookは実名登録が規約で決まっています。店名やニックネームで登録すると、
            あとから本人確認を求められ、アカウントが使えなくなることがあります。
          </Note>
        </Step>

        <Step no="STEP 2" title="確認コードを入力する">
          <ol className="list-decimal space-y-2 pl-5">
            <li>登録したメールアドレス（または携帯電話）に、<strong>5桁ほどの数字</strong>が届きます</li>
            <li>画面の入力欄にその数字を入れて、<Ui>続行</Ui> を押します</li>
            <li>Facebookの画面が表示されれば完了です</li>
          </ol>
          <Note>
            <b>コードが届かないときは</b>、迷惑メールフォルダをご確認ください。
            それでも届かない場合は <Ui>コードを再送信</Ui> を押してください。
          </Note>
          <p>
            このあと「友達を追加しましょう」「プロフィール写真を設定しましょう」と案内が出ますが、
            <strong>すべてスキップして構いません</strong>。この設定には必要ありません。
          </p>
        </Step>

        {/* ── 第2部 ── */}
        <PartHead no="第 2 部" title="開発者としての登録をする" lede="窓口を作れるようにするための、Meta社への登録です。無料です。" />
        <Step no="STEP 3" title="Meta for Developers に登録する">
          <ol className="list-decimal space-y-2 pl-5">
            <li>ブラウザで <code className="bg-emerald-50 px-1.5 py-0.5 font-mono text-[0.88em] dark:bg-emerald-950/40">developers.facebook.com</code> を開きます</li>
            <li>右上の <Ui>ログイン</Ui> から、先ほど作った（またはお持ちの）Facebookアカウントでログインします</li>
            <li>右上の <Ui>はじめる</Ui> を押します</li>
            <li>
              案内に沿って進めます
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li><strong>電話番号の確認</strong>：SMSで届いた数字を入力します</li>
                <li><strong>メールアドレスの確認</strong>：届いたメールのリンクを押します</li>
                <li><strong>役割の選択</strong>：迷ったら <Ui>開発者</Ui> を選んでください</li>
              </ul>
            </li>
          </ol>
          <Note>
            <b>英語の画面が出たときは</b>、ページの一番下までスクロールすると言語を切り替えるところがあります。
            <Ui>日本語</Ui> を選ぶと読みやすくなります。
          </Note>
        </Step>

        {/* ── 第3部 ── */}
        <PartHead no="第 3 部" title="窓口（アプリ）を作る" lede="画面の言葉は難しく見えますが、選ぶものは決まっています。" />
        <Step no="STEP 4" title="アプリを作成する">
          <ol className="list-decimal space-y-2 pl-5">
            <li>画面上部の <Ui>マイアプリ</Ui> を押します</li>
            <li><Ui>アプリを作成</Ui> を押します</li>
            <li>アプリ名を入力します（例：<strong>◯◯整体院 投稿</strong>。ご自身が分かる名前で構いません）</li>
            <li>用途を選ぶ画面で <strong>Threads API</strong> を選んで次へ進みます</li>
            <li>確認画面で <Ui>アプリを作成</Ui> を押して完了します</li>
          </ol>
          <Stop>
            <b>用途は必ず「Threads API」を選んでください。</b>
            別のものを選ぶと、このあと必要な画面が出てこず、最初からやり直しになります。
          </Stop>
        </Step>

        <Step no="STEP 5" title="3つのURLを貼り付ける">
          <p>
            左のメニューから <Ui>ユースケース</Ui> → <Ui>Threads APIにアクセス</Ui> → <Ui>設定</Ui> と進み、
            次の3か所に下の文字列をそのまま貼り付けます。
          </p>
          <div className="border border-border">
            {URLS.map((u, i) => (
              <div
                key={u.key}
                className={`flex flex-wrap items-center gap-3 bg-card px-4 py-3 ${i < URLS.length - 1 ? "border-b border-border" : ""}`}
              >
                <span className="basis-52 shrink-0 text-[0.82rem] text-muted-foreground">{u.label}</span>
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[0.79rem] text-foreground">
                  {u.value}
                </code>
                <button
                  type="button"
                  onClick={() => copy(u.key, u.value)}
                  className="shrink-0 rounded-sm border border-border px-2.5 py-1 text-[0.78rem] text-muted-foreground transition-colors hover:border-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-400 print:hidden"
                >
                  {copied === u.key ? (
                    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <Check className="h-3 w-3" />コピーしました
                    </span>
                  ) : (
                    <span className="flex items-center gap-1"><Copy className="h-3 w-3" />コピー</span>
                  )}
                </button>
              </div>
            ))}
          </div>
          <p>3つとも入れたら <Ui>保存する</Ui> を押します。</p>
          <Stop>
            <b>手で打たないでください。</b>
            1文字でも違うと連携できません。<Ui>コピー</Ui> ボタンを押してから、
            入力欄で貼り付け（Windowsは Ctrl+V、Macは ⌘+V）してください。
          </Stop>
        </Step>

        <Step no="STEP 6" title="2つの文字列を控える">
          <p>
            左のメニューから <Ui>アプリの設定</Ui> → <Ui>ベーシック</Ui> を開き、
            画面を下にスクロールすると次の2つがあります。
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>ThreadsアプリID</strong> … 長い数字です。そのままコピーします</li>
            <li><strong>Threadsのapp secret</strong> … ●●●● で隠れています。右の <Ui>表示</Ui> を押すと読めます</li>
          </ul>
          <p>この2つは最後の手順で使います。メモ帳などに貼っておくと安心です。</p>
          <Stop>
            <b>「アプリID」と「ThreadsアプリID」は別物です。</b>
            画面の上のほうにも似た名前の項目がありますが、必ず <strong>Threads</strong> と付いているほうを使ってください。
            ここを間違える方が非常に多いです。
          </Stop>
          <Note>
            <b>app secret はパスワードと同じです。</b>
            メールやSNSで他人に送らないでください。Threads Studioへの入力だけに使います。
          </Note>
        </Step>

        {/* ── 第4部 ── */}
        <PartHead no="第 4 部" title="お店のThreadsに使用許可を出す" lede="作ったばかりの窓口は、まだご自身のThreadsにも使えません。使えるようにします。" />
        <Step no="STEP 7" title="Threadsアカウントを招待する">
          <ol className="list-decimal space-y-2 pl-5">
            <li>左のメニューから <Ui>アプリの役割</Ui> → <Ui>役割</Ui> を開きます</li>
            <li><Ui>メンバーを追加</Ui> を押します</li>
            <li>選択肢の中から <strong>Threadsテスター</strong> を選びます</li>
            <li>お店の<strong>Threadsのユーザー名</strong>を入力します（@マークのあとの部分）</li>
            <li>招待を送ります</li>
          </ol>
          <Stop>
            <b>「テスター」と「Threadsテスター」は別物です。</b>
            必ず <strong>Threadsテスター</strong> を選んでください。
            ここを間違えると、最後まで進んでも連携できません。
          </Stop>
        </Step>

        <Step no="STEP 8" title="Threads側で招待を受け入れる">
          <ol className="list-decimal space-y-2 pl-5">
            <li>スマホまたはパソコンで <strong>Threads</strong> を開きます</li>
            <li>お店のアカウントでログインしていることを確認します</li>
            <li>プロフィール → <Ui>設定</Ui> を開きます</li>
            <li><Ui>ウェブサイトのアクセス許可</Ui> を開きます</li>
            <li>STEP 7で送った招待が表示されるので、<strong>承諾</strong>します</li>
          </ol>
          <Note>
            <b>招待が見当たらないときは</b>、次の2点をご確認ください。<br />
            ① STEP 7で入力したユーザー名は合っていますか（@は不要です）<br />
            ② いま開いているThreadsは、招待を送った先のアカウントですか
          </Note>
        </Step>

        {/* ── 第5部 ── */}
        <PartHead no="第 5 部" title="Threads Studioにつなぐ" lede="あと少しで完了です。" />
        <Step no="STEP 9" title="控えた2つを登録して、連携する">
          <ol className="list-decimal space-y-2 pl-5">
            <li>Threads Studioにログインします</li>
            <li>左のメニューから <Ui>設定</Ui> を開きます</li>
            <li>下のほうにある <Ui>自分のMetaアプリで連携する（上級者向け）</Ui> の <Ui>設定する</Ui> を押します</li>
            <li>STEP 6で控えた <strong>ThreadsアプリID</strong> と <strong>app secret</strong> をそれぞれ貼り付けます</li>
            <li><Ui>保存する</Ui> を押します</li>
            <li>左のメニューから <Ui>Threads連携</Ui> を開きます</li>
            <li><Ui>Threadsと連携</Ui>（連携済みの表示がある場合は <Ui>接続をやり直す</Ui>）を押します</li>
            <li>Threadsの画面が開くので、内容を確認して <strong>許可</strong> を押します</li>
          </ol>
          <p>元の画面に戻り、お店のアカウント名が表示されれば設定完了です。おつかれさまでした。</p>
        </Step>

        {/* 確認・トラブル */}
        <section className="mt-14 border-t-2 border-foreground pt-8">
          <h2 className="mb-4 text-[1.2rem] font-extrabold text-foreground">できているかの確認</h2>
          <ul className="mb-8 space-y-2">
            {[
              "設定画面に「現在このアカウントは自分のアプリで連携する設定です」と出ている",
              "Threads連携の画面に、お店のThreadsアカウント名が出ている",
              "AI投稿生成で作った投稿を、実際にThreadsへ公開できる",
            ].map((t) => (
              <li key={t} className="relative pl-7 leading-relaxed">
                <span className="absolute left-0 top-[0.62em] h-2.5 w-2.5 rounded-[1px] border-[1.5px] border-emerald-700 dark:border-emerald-400" />
                {t}
              </li>
            ))}
          </ul>

          <div className="mb-6 border border-border bg-card px-6 py-6">
            <h3 className="mb-4 text-[0.98rem] font-bold text-foreground">うまくいかないとき</h3>
            <dl className="space-y-4">
              {[
                ["連携ボタンを押すとエラーが出る", "STEP 5のURLをご確認ください。前後に空白が入っていたり、1文字違うだけで失敗します。コピーし直して貼り替えてください。"],
                ["「権限がありません」と表示される", "STEP 7・8ができていない可能性が高いです。Threadsの「ウェブサイトのアクセス許可」に招待が残っていないかご確認ください。"],
                ["Threadsのログイン画面で別のアカウントが出る", "パソコンでThreadsから一度ログアウトし、お店のアカウントでログインし直してからお試しください。"],
                ["スマホでやったら途中で止まった", "スマホではThreadsアプリが割り込んで先に進めないことがあります。パソコンで行ってください。"],
                ["Facebookのアカウントが停止された", "実名以外で登録した場合に起こります。画面の案内に沿って本人確認をすると解除できます。"],
                ["どこを見ているか分からなくなった", "この資料の第何部のSTEP何で止まっているかをお知らせください。その場面からご案内します。"],
              ].map(([q, a]) => (
                <div key={q}>
                  <dt className="text-[0.92rem] font-bold text-foreground">{q}</dt>
                  <dd className="mt-1 text-[0.92rem] text-muted-foreground">{a}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="border border-border px-6 py-6">
            <h3 className="mb-4 text-[0.98rem] font-bold text-foreground">用語のかんたんな説明</h3>
            <dl className="space-y-4">
              {[
                ["Meta（メタ）", "Threads・Instagram・Facebookを運営している会社です。3つとも同じ会社のサービスです。"],
                ["Meta for Developers", "Meta社が用意している、アプリを登録するための管理サイトです。今回はここで窓口を作ります。"],
                ["アプリ", "ここでは「Threadsへ投稿するための窓口」のことです。スマホアプリを作るわけではありません。"],
                ["ThreadsアプリID / app secret", "作った窓口の「番号」と「合言葉」です。この2つをThreads Studioに教えることで投稿できるようになります。"],
                ["Threadsテスター", "その窓口を使ってよいアカウント、という意味です。お店のThreadsをここに登録します。"],
              ].map(([q, a]) => (
                <div key={q}>
                  <dt className="text-[0.92rem] font-bold text-foreground">{q}</dt>
                  <dd className="mt-1 text-[0.92rem] text-muted-foreground">{a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <footer className="mt-12 border-t border-border pt-6 text-[0.87rem] text-muted-foreground">
          設定でお困りのときは、「第◯部 STEP ◯で止まっています」とご担当者までお知らせください。
        </footer>
      </div>
    </div>
  );
}

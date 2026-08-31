import { Link } from "wouter";
import { BookOpen, ChevronDown } from "lucide-react";

/**
 * よくある質問（利用中クライアント向け・公開ページ・ログイン不要）。
 *
 * LINEリッチメニューの「よくある質問」から開く想定。運営に質問が来る前に
 * 自己解決できる状態がゴールなので、回答は必ず「どの画面のどのボタンを押すか」
 * まで書く。画面のボタン名を変えたときは、このページの文言も必ず合わせて更新すること。
 *
 * ※ 公開サイト（契約前の人向け）のFAQは /faq（FAQ.tsx）。こちらは運用サポート用。
 * アプリ内リンクは相対パスにする（LINEトーク内=LIFFで開かれたときも、
 * 同一オリジン内の遷移ならセッションが生きたまま移動できる）。
 */

function Qa({ q, children, defaultOpen }: { q: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-border bg-card px-4 py-3 open:pb-4"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="text-[0.95rem] font-bold leading-snug text-foreground">{q}</span>
        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-2 text-sm leading-[1.9] text-foreground/90">{children}</div>
    </details>
  );
}

function Ui({ children }: { children: React.ReactNode }) {
  return <span className="font-bold text-foreground">「{children}」</span>;
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Help() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
        <p className="mb-1 font-mono text-[0.78rem] font-bold tracking-wider text-emerald-700 dark:text-emerald-400">
          THREADS STUDIO
        </p>
        <h1 className="mb-2 text-2xl font-bold text-foreground">よくある質問</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          お問い合わせの前に、まずこちらをご覧ください。ほとんどの操作はLINEのメニュー、
          またはアプリの設定画面で完結します。
        </p>

        <div className="space-y-3">
          <Qa q="「お店の集客」と「個人にファンをつける」、どちらを選べばいい？">
            <p>
              最初の設定で選ぶ「発信の目的」です。お客様に<span className="font-bold text-foreground">来てもらう場所（店舗）</span>が
              あるなら<Ui>お店の集客</Ui>、あなた<span className="font-bold text-foreground">個人の名前で仕事をしている</span>
              （経営者・コーチ・士業・フリーランスなど）なら<Ui>個人にファンをつける</Ui>を選んでください。
            </p>
            <p>
              両方に当てはまる場合は、いま売上に直結する方を選ぶのがおすすめです。
              選択はあとから作り直せます（<Ui>お店の情報</Ui>から質問にもう一度答え直すだけです）。
            </p>
          </Qa>

          <Qa q="店長など、他の人も通知を受け取り、操作できるようにしたい" defaultOpen>
            <p>1つのアカウントに、複数の人のLINEを連携できます（ライトプラン1人・プロプラン3人・ビジネスプラン無制限）。</p>
            <Steps
              items={[
                <>追加したい人が、公式LINE「Threads Studio 通知」を友だち追加する</>,
                <>
                  どなたかがLINEメニューの<Ui>設定</Ui>を開き、<Ui>別のLINEを追加連携</Ui>
                  を押して6桁のコードを表示する
                </>,
                <>追加したい人が、自分のLINEのトークにその6桁コードを送る</>,
              ]}
            />
            <p>
              これで完了です。以後、その人にも承認依頼・コメント通知が届き、
              LINEのメニューからすべての操作ができます。
            </p>
          </Qa>

          <Qa q="投稿の内容が、思っていたものと違う">
            <p>直し方は2段階あります。</p>
            <p>
              <span className="font-bold">今日の投稿を直す：</span>メニューの<Ui>投稿の確認</Ui>
              から、公開前の投稿を書き換えるか、公開を止められます。
            </p>
            <p>
              <span className="font-bold">今後の投稿を変える：</span>メニューの<Ui>お店の情報</Ui>
              から、お店の強み・メニュー・お客様の悩みを修正してください。以後のAIの文章に反映されます。
              使ってほしくない言葉は<Ui>設定</Ui>のNGワードに登録すると、以後自動で避けられます。
            </p>
          </Qa>

          <Qa q="投稿を、公開される前に自分で確認したい">
            <p>
              <Ui>設定</Ui>の<Ui>公開前に承認する</Ui>をONにしてください。
              以後、投稿は「承認待ち」で止まり、LINEに届く承認依頼からOKを出したものだけが公開されます。
            </p>
          </Qa>

          <Qa q="すでに公開された投稿を消したい">
            <p>
              公開済みの投稿の削除だけは、Threadsアプリ側での操作になります。
              Threadsアプリで該当の投稿を開き、右上の「…」から削除してください。
            </p>
          </Qa>

          <Qa q="LINEに通知が来ない">
            <Steps
              items={[
                <>公式LINE「Threads Studio 通知」をブロックしていないか確認する</>,
                <>
                  LINEメニューの<Ui>設定</Ui>で、連携中のLINE一覧に自分が表示されているか確認する
                  （表示がなければ<Ui>別のLINEを追加連携</Ui>からやり直し）
                </>,
                <>
                  承認依頼の通知は<Ui>公開前に承認する</Ui>がONのときだけ届きます（設定画面で確認）
                </>,
              ]}
            />
          </Qa>

          <Qa q="コメントには、どうやって返信すればいい？">
            <p>
              メニューの<Ui>コメント</Ui>を開くと、届いたコメントごとにAIが返信の文案を用意しています。
              内容を確認して、コピーしてThreadsアプリから返信してください
              （返信の直接送信は、現在Meta社の追加審査の承認待ちです。承認され次第、ワンタップ送信になります）。
            </p>
          </Qa>

          <Qa q="投稿の回数や、長さを変えたい">
            <p>
              <Ui>設定</Ui>から変更できます。投稿頻度（1日1〜3回・プランによります）、
              投稿の長さ（短め・長め・交互）、文体の調整もここです。
            </p>
          </Qa>

          <Qa q="ログインできない・パスワードを忘れた">
            <p>
              ログイン画面の<Ui>パスワードをお忘れですか？</Ui>から再設定できます。
              代理店経由でご利用の場合は、IDをお渡しした担当者にパスワードの再設定を依頼することもできます。
            </p>
          </Qa>

          <Qa q="LINE連携を解除したい">
            <p>
              公式LINEのトークに<Ui>解除</Ui>と送るか、<Ui>設定</Ui>の連携一覧から
              解除したいLINEの<Ui>解除</Ui>ボタンを押してください。
            </p>
          </Qa>

          <Qa q="解約したい・プランを変えたい">
            <p>
              直接ご契約の方は、アプリの料金ページからいつでも変更・解約できます。
              代理店経由でご利用の方は、IDをお渡しした担当者にご連絡ください。
            </p>
          </Qa>
        </div>

        <Link
          href="/manual"
          className="mt-6 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3.5 dark:border-emerald-900 dark:bg-emerald-950/20"
        >
          <span className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
            <span>
              <span className="block text-sm font-bold text-foreground">使い方マニュアル</span>
              <span className="block text-xs text-muted-foreground">毎日の使い方を最初から知りたい方はこちら</span>
            </span>
          </span>
          <span className="text-emerald-700 dark:text-emerald-400">→</span>
        </Link>

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          ここで解決しなかった場合は、サービスをご案内した担当者までご連絡ください。
        </p>
      </div>
    </div>
  );
}

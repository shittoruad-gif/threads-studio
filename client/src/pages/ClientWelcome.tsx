import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, ArrowRight } from "lucide-react";

/**
 * 代理店がクライアント（契約者）に送る「はじめにお読みください」資料。
 * 公開ページ（ログイン不要）。URLを送るだけで読んでもらえる。
 *
 * ねらい: 店舗オーナーが最初に抱く不安
 *   「毎日なにかしないといけない？」「変な投稿をされない？」「途中でやめられる？」
 * に先回りで答え、最初の3つの作業だけに集中してもらう。
 */

function Card({ children }: { children: React.ReactNode }) {
  return <div className="border border-border bg-card px-6 py-6">{children}</div>;
}

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/70 pt-5 first:border-t-0 first:pt-0">
      <p className="mb-2 font-bold text-foreground">{q}</p>
      <div className="text-[0.94rem] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

export default function ClientWelcome() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 pb-24 pt-12">
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
            はじめにお読みください
          </p>
          <h1 className="mb-4 text-[clamp(1.6rem,4.5vw,2.1rem)] font-extrabold leading-tight tracking-tight text-foreground text-balance">
            Threads Studio のはじめ方
          </h1>
          <p className="text-muted-foreground">
            このたびはお申し込みいただきありがとうございます。
            Threads Studioは、お店のThreadsに<strong className="text-foreground">AIが毎日自動で投稿してくれる</strong>サービスです。
            最初に3つだけ設定していただければ、あとは基本的に放っておいて構いません。
          </p>
        </header>

        {/* 何をしてくれるのか */}
        <section className="mt-10">
          <h2 className="mb-4 text-[1.25rem] font-extrabold text-foreground">このサービスがすること</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { t: "毎日の投稿を書く", d: "お店の情報をもとに、AIが投稿文を作って自動で公開します。ネタ切れも文章を考える時間も要りません。" },
              { t: "コメントに返す", d: "投稿に付いたコメントへの返信文をAIが作ります。ワンタップで返信できます。" },
              { t: "反応を数字で見せる", d: "どの投稿が読まれたか、どの投稿から問い合わせが来たかが分かります。" },
            ].map((c) => (
              <div key={c.t} className="border border-border bg-card px-5 py-5">
                <p className="mb-2 font-bold text-foreground">{c.t}</p>
                <p className="text-[0.9rem] leading-relaxed text-muted-foreground">{c.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 最初にやること */}
        <section className="mt-12">
          <h2 className="mb-2 text-[1.25rem] font-extrabold text-foreground">最初にやっていただく3つのこと</h2>
          <p className="mb-6 text-[0.94rem] text-muted-foreground">
            合わせて1時間ほどです。これが終われば、翌日から自動で投稿が始まります。
          </p>

          <div className="space-y-4">
            {[
              {
                n: "1",
                t: "ログインする",
                time: "1分",
                body: (
                  <>
                    <p>ご担当者からお渡しした<strong className="text-foreground">メールアドレスとパスワード</strong>でログインしてください。</p>
                    <p className="mt-2">ログインしたら、まずパスワードをご自身のものに変更されることをおすすめします（設定画面から変更できます）。</p>
                  </>
                ),
              },
              {
                n: "2",
                t: "Threadsとつなぐ",
                time: "30〜40分",
                body: (
                  <>
                    <p>お店のThreadsに投稿できるようにするための設定です。少し手数がありますが、<strong className="text-foreground">最初の一度だけ</strong>です。</p>
                    <p className="mt-3">
                      <a
                        href="/threads-setup-guide"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400"
                      >
                        設定手順を開く（画面のとおりに進めるだけです）
                        <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                    </p>
                  </>
                ),
              },
              {
                n: "3",
                t: "お店のことを教える",
                time: "10〜15分",
                body: (
                  <>
                    <p>
                      業種・地域・お客様の悩み・お店の強みなどを入力していただきます。
                      AIはここで教えていただいた<strong className="text-foreground">事実だけ</strong>を使って投稿を書きます。
                    </p>
                    <p className="mt-2">
                      画面の質問に答えていくだけで完成します。分からない項目は空欄のままでも構いません。
                    </p>
                  </>
                ),
              },
            ].map((s) => (
              <div key={s.n} className="flex gap-5 border border-border bg-card px-6 py-5">
                <div className="shrink-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 font-mono text-sm font-bold text-white dark:bg-emerald-600">
                    {s.n}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-baseline gap-3">
                    <h3 className="text-[1.08rem] font-bold text-foreground">{s.t}</h3>
                    <span className="text-[0.8rem] text-muted-foreground">目安 {s.time}</span>
                  </div>
                  <div className="text-[0.94rem] leading-relaxed text-muted-foreground">{s.body}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 設定後の使い方 */}
        <section className="mt-12">
          <h2 className="mb-2 text-[1.25rem] font-extrabold text-foreground">設定が終わったあとは</h2>
          <p className="mb-5 text-[0.94rem] text-muted-foreground">
            毎日の作業はありません。週に1回、5分ほど画面を見ていただければ十分です。
          </p>
          <Card>
            <div className="space-y-5">
              <Q q="週に1回、見ていただきたいところ">
                <ul className="list-disc space-y-1.5 pl-5">
                  <li><strong className="text-foreground">コメント管理</strong>… お客様からのコメントに返信できます。AIが返信文を用意しているので、選んで送るだけです</li>
                  <li><strong className="text-foreground">投稿分析</strong>… どの投稿がよく読まれたかが分かります。反応の良かった内容は、AIが次の投稿にも活かします</li>
                </ul>
              </Q>
              <Q q="投稿を追加したくなったら">
                <p>
                  <strong className="text-foreground">AI投稿生成</strong>から、いつでも手動で投稿を作れます。
                  キャンペーンのお知らせなど、自動投稿とは別に出したいときにお使いください。
                </p>
              </Q>
            </div>
          </Card>
        </section>

        {/* 不安への回答 */}
        <section className="mt-12">
          <h2 className="mb-5 text-[1.25rem] font-extrabold text-foreground">よくいただくご質問</h2>
          <Card>
            <div className="space-y-5">
              <Q q="AIが変なことを書いてしまわないか心配です">
                <p>
                  次の3つの仕組みで防いでいます。
                </p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5">
                  <li>AIは、最初に教えていただいたお店の情報<strong className="text-foreground">だけ</strong>を使います。実績や料金を勝手に作ることはありません</li>
                  <li><strong className="text-foreground">使ってほしくない言葉</strong>を登録できます（例：「完治」「must」など）。登録した言葉は絶対に投稿に入りません</li>
                  <li>
                    <strong className="text-foreground">公開前の確認モード</strong>をONにすると、AIが書いた投稿は「承認待ち」に入り、
                    ご自身が確認して承認するまで公開されません
                  </li>
                </ul>
                <p className="mt-2">
                  最初のうちは確認モードをONにして、内容に慣れてからOFFにされる方が多いです。
                </p>
              </Q>

              <Q q="毎日なにか作業が必要ですか？">
                <p>
                  いいえ。設定が終われば、投稿は自動で公開されます。
                  投稿の回数（1日1〜3回）も設定画面で選べます。
                </p>
              </Q>

              <Q q="投稿の内容は自分で直せますか？">
                <p>
                  はい。AIが作った文章は公開前に自由に書き換えられます。
                  「この言い回しは使わない」といった調整も、お店の情報や使ってほしくない言葉の設定に反映すれば、次回以降のAIが学びます。
                </p>
              </Q>

              <Q q="Threadsのアカウントを持っていません">
                <p>
                  先にThreadsのアカウントをご用意ください。Instagramをお持ちであれば、そのアカウントでThreadsを始められます。
                  ご不明な場合はご担当者にご相談ください。
                </p>
              </Q>

              <Q q="途中でやめられますか？">
                <p>
                  はい。ご契約はご担当者を通じていつでも終了できます。
                  終了後は自動投稿が止まりますが、それまでに公開された投稿はThreadsに残ります。
                </p>
              </Q>

              <Q q="設定の途中で分からなくなりました">
                <p>
                  ご担当者にご連絡ください。その際、
                  <strong className="text-foreground">「設定手順の第◯部 STEP ◯で止まっています」</strong>
                  とお伝えいただけると、すぐにご案内できます。
                </p>
              </Q>
            </div>
          </Card>
        </section>

        {/* 次のアクション */}
        <section className="mt-12 border-t-2 border-foreground pt-8">
          <h2 className="mb-3 text-[1.2rem] font-extrabold text-foreground">それでは、始めましょう</h2>
          <p className="mb-5 text-[0.95rem] text-muted-foreground">
            まずはログインして、Threadsとの接続から進めてください。
          </p>
          <div className="flex flex-wrap gap-3 print:hidden">
            <Button
              onClick={() => setLocation("/login")}
              className="bg-emerald-700 text-white hover:bg-emerald-800"
            >
              ログインする
            </Button>
            <Button variant="outline" asChild>
              <a href="/threads-setup-guide" target="_blank" rel="noopener noreferrer">
                設定手順を先に読む
              </a>
            </Button>
          </div>
        </section>

        <footer className="mt-12 border-t border-border pt-6 text-[0.87rem] text-muted-foreground">
          ご不明な点は、お渡ししたご担当者の連絡先までお気軽にお問い合わせください。
        </footer>
      </div>
    </div>
  );
}

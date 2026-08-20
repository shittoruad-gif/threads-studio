import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import ThreadPreview from "@/components/ThreadPreview";
import {
  Check, MapPin, Sparkles, MessageCircle, BarChart3, Clock, ArrowRight, Share2, Eye, Heart, Lock,
} from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * 未導入の方向けの紹介ページ（公開・ログイン不要）。
 *
 * 既存クライアント向けの /manual と役割を分ける：
 *   /manual … 契約済みの人が「毎日何をすればいいか」を確認する
 *   /tour   … まだ使っていない人が「どんなものか」を見て判断する
 *
 * 実際のアプリ画面の再現と、Threadsに公開されたときの見え方を並べ、
 * 説明を読まなくても使用イメージが持てる状態を目指す。
 * アプリを更新したらこのページも合わせて更新すること。
 */

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[0.95rem] font-bold text-white">
        {n}
      </div>
      <div className="min-w-0 flex-1 pb-8">
        <p className="mb-1 text-[1.02rem] font-bold leading-snug text-foreground">{title}</p>
        <div className="text-[0.95rem] leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function Screen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/50 px-4 py-2 text-[0.75rem] font-bold tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-emerald-600">{icon}</span>
        <p className="text-[0.98rem] font-bold text-foreground">{title}</p>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}


/**
 * 実際に反応が取れた投稿の一覧（自動更新）。
 *
 * 手で書いた作り話ではなく、本番で配信されて数字が出た投稿をそのまま出す。
 * 新しく伸びた投稿が出れば自動で入れ替わるので、このページを書き直す必要はない。
 * 店名・駅名・URLはサーバ側で伏せてから届く（server/showcase.ts）。
 */
function LiveExamples() {
  const { data, isLoading } = trpc.showcase.list.useQuery(undefined, {
    staleTime: 1000 * 60 * 30,
  });
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-muted/40" />
        ))}
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-[0.8rem] font-bold text-muted-foreground">{item.label}</p>

            {/* 冒頭のさわりだけ見せる */}
            <p className="whitespace-pre-wrap break-words text-[0.92rem] font-medium leading-relaxed text-foreground">
              {item.excerpt}
            </p>

            {/* 続きは伏せる。読ませるのではなく「続きがある」ことだけ伝える */}
            {item.hiddenChars > 0 && (
              <div className="relative mt-2 flex-1">
                <div aria-hidden className="select-none space-y-2 blur-[5px]" >
                  {Array.from({ length: item.hiddenLines }).map((_, k) => (
                    <div
                      key={k}
                      className="h-3 rounded bg-foreground/25"
                      style={{ width: `${[96, 88, 72, 91][k % 4]}%` }}
                    />
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/95 px-3 py-1 text-[0.72rem] font-bold text-muted-foreground shadow-sm">
                    <Lock className="h-3 w-3" />
                    続き{item.hiddenChars}文字は非公開
                  </span>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-[0.8rem] text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                <Eye className="h-3.5 w-3.5" />
                {item.impressions.toLocaleString()}回表示
              </span>
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3.5 w-3.5" />
                {item.likes.toLocaleString()}
              </span>
              {item.replies > 0 && (
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {item.replies.toLocaleString()}
                </span>
              )}
              {item.postedAt && <span className="ml-auto">{item.postedAt.replace("-", "年")}月</span>}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        実際に配信された投稿と、その実測値です。数字は加工していません。
        ご利用店舗が特定されないよう、アカウント名・店名・駅名・リンクは伏せています。
        本文は冒頭のみの公開です。反応の大きい投稿が出るたび、この一覧は自動で入れ替わります。
      </p>
    </>
  );
}

export default function Tour() {
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/tour`;
    try {
      if (navigator.share) await navigator.share({ title: "Threads Studio", url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch { /* キャンセル時は何もしない */ }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-10 sm:px-6">

        <div className="mb-8 flex justify-end print:hidden">
          <Button variant="ghost" size="sm" onClick={share}>
            {copied ? <><Check className="mr-1 h-4 w-4" />コピーしました</> : <><Share2 className="mr-1 h-4 w-4" />このページを共有</>}
          </Button>
        </div>

        <header className="mb-10">
          <p className="mb-3 font-mono text-[0.78rem] font-bold tracking-wider text-emerald-700 dark:text-emerald-400">
            THREADS STUDIO
          </p>
          <h1 className="mb-4 text-[1.75rem] font-bold leading-tight text-foreground sm:text-[2.1rem]">
            店舗の投稿を、AIが毎日つくって<br className="hidden sm:block" />自動で公開します
          </h1>
          <p className="text-[1.02rem] leading-relaxed text-muted-foreground">
            お店の情報を一度だけ登録すれば、あとは毎日の投稿をAIが作って、反応の出やすい時間に公開します。
            オーナーがすることは、1日1分の確認だけです。確認すら不要にすることもできます。
          </p>
        </header>

        <section className="mb-12">
          <h2 className="mb-5 text-[1.2rem] font-bold text-foreground">毎日やることは、これだけです</h2>
          <Step n={1} title="AIが投稿を作る（自動）">
            登録された業種・地域・お客様の悩みをもとに、その日の投稿を作ります。
            事実として入力された内容だけを使うので、実績や数字を勝手に作ることはありません。
          </Step>
          <Step n={2} title="内容を見て、承認する（1分）">
            スマホで文章を読んで、よければボタンを1つ押すだけです。
            直したいときはその場で書き換えられます。承認そのものを省いて全自動にもできます。
          </Step>
          <Step n={3} title="決めた時間に公開される（自動）">
            反応が出やすい時間帯に自動で公開されます。
            投稿から数時間後には、会話が生まれやすいひとことも自動で追加されます。
          </Step>
        </section>

        <section className="mb-12">
          <h2 className="mb-2 text-[1.2rem] font-bold text-foreground">実際にはこう投稿されます</h2>
          <p className="mb-1 text-[0.95rem] leading-relaxed text-muted-foreground">
            1回の投稿は、1本の文章と「続き」がつながった形で公開されます。
            長い話でも読み手が追いやすく、最後まで読んだ人だけが公式LINEの案内にたどり着きます。
          </p>
          <ThreadPreview
            handle="◯◯整体院"
            posts={[
              "金光駅から徒歩6分の整体院です。\n\n猫背が気になる方から、よくこう聞かれます。\n「もう歳だから戻らないですよね？」",
              "実は逆で、姿勢は何歳からでも変わります。\n\n固まっているのは骨ではなく、その周りの筋肉だからです😊",
              "気になる方は、プロフィールのリンクから公式LINEにご登録ください。\nかんたんな姿勢チェックをお送りしています。",
            ]}
          />
        </section>

        <section className="mb-12">
          <h2 className="mb-2 text-[1.2rem] font-bold text-foreground">実際に反応が取れた投稿</h2>
          <p className="mb-4 text-[0.95rem] leading-relaxed text-muted-foreground">
            ご利用中の店舗で実際に配信され、反応が大きかった投稿です。
          </p>
          <LiveExamples />
          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
            <p className="mb-2 text-[0.95rem] font-bold text-foreground">
              伸びるかどうかは、文章そのものではなく「条件」で決まります
            </p>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>・その日どの型で書くか（同じ型を続けると伸びが落ちます）</li>
              <li>・1行目を何文字で切るか、どこで改行するか</li>
              <li>・そのお店の商圏を、どの粒度で言い切るか</li>
              <li>・何時に出し、何時間後にひとことを足すか</li>
            </ul>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              この判断を毎日続けるのが難しいところです。Threads Studioは、実際に出た数字を見ながらこの条件を自動で調整します。
            </p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="mb-2 text-[1.2rem] font-bold text-foreground">お店の商圏を、アプリが提案します</h2>
          <p className="mb-1 text-[0.95rem] leading-relaxed text-muted-foreground">
            「岡山県の整体院です」より「金光駅から徒歩6分」と書いたほうが、読んだ人が「うちの近くだ」と気づいて反応が上がります。
            最寄り駅と所要時間は地図から自動で調べ、こういう形で確認を求めます。
          </p>
          <Screen label="ホーム画面に出るカード">
            <div className="rounded-xl border-2 border-sky-300 bg-sky-50/70 p-4 dark:border-sky-800 dark:bg-sky-950/20">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-sky-900 dark:text-sky-200">この商圏で投稿してよいですか？</p>
                  <ul className="mt-2 space-y-1 rounded-lg border border-sky-200 bg-white p-3 text-sm font-medium text-foreground dark:border-sky-800 dark:bg-background">
                    <li>・金光町占見新田</li>
                    <li>・金光駅から徒歩約6分</li>
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-bold text-white">この内容で投稿する</span>
                    <span className="rounded-md border border-border px-3 py-1.5 text-xs font-bold text-foreground">自分で直す</span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">確認するまで、この内容は投稿には使われません。</p>
                </div>
              </div>
            </div>
          </Screen>
          <p className="text-sm leading-relaxed text-muted-foreground">
            所要時間は地図上の概算なので、実際と違えばその場で直せます。
            確認していただくまで投稿には使いません。ご来店を伴わない業種では、この提案は出ません。
          </p>
        </section>

        <section className="mb-12">
          <h2 className="mb-2 text-[1.2rem] font-bold text-foreground">コメントへの返信も、候補から選ぶだけ</h2>
          <p className="mb-1 text-[0.95rem] leading-relaxed text-muted-foreground">
            お客様からコメントが付くと、返信の文案をAIが3つ提案します。選んで、必要なら直して、送るだけです。
          </p>
          <ThreadPreview
            handle="◯◯整体院"
            posts={["猫背が気になる方から、よくこう聞かれます。\n「もう歳だから戻らないですよね？」"]}
            reply={{
              handle: "お客様",
              text: "気になります",
              ourReply: "コメントありがとうございます！\n実は、姿勢は何歳からでも変わるんです😊\nよければ一度ご相談ください。",
            }}
          />
        </section>

        <section className="mb-12">
          <h2 className="mb-5 text-[1.2rem] font-bold text-foreground">続けるほど、投稿が当たるようになります</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Feature icon={<BarChart3 className="h-5 w-5" />} title="伸びた型を自動で増やす">
              どの型の投稿が実際に見られたかを記録し、成績の良い型を次から増やします。
              オーナーの操作は必要ありません。
            </Feature>
            <Feature icon={<Sparkles className="h-5 w-5" />} title="好みも覚える">
              投稿に「いい」「違う」を押すだけで、その方向性が増減します。
              数字と好みの両方をふまえて次の投稿を作ります。
            </Feature>
            <Feature icon={<Clock className="h-5 w-5" />} title="当たる時間に寄っていく">
              実績が溜まると、そのお店で反応が高い時間帯を見つけて投稿時刻を寄せます。
            </Feature>
            <Feature icon={<MessageCircle className="h-5 w-5" />} title="会話のきっかけを自動で足す">
              投稿の数時間後に、ひとことで答えられる質問を自動で足します。
              コメントが付くと投稿がもう一度表示されやすくなります。
            </Feature>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/30">
          <h2 className="mb-2 text-[1.2rem] font-bold text-foreground">まずは1本、無料で作ってみてください</h2>
          <p className="mb-4 text-[0.95rem] leading-relaxed text-muted-foreground">
            登録なしで、お店の情報を入れるだけで実際の投稿文を作れます。
            出てきた文章を見てから、導入を判断していただけます。
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setLocation("/try")} className="bg-emerald-600 text-white hover:bg-emerald-700">
              無料で投稿を作ってみる
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setLocation("/pricing")}>
              料金を見る
            </Button>
          </div>
        </section>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          株式会社しっとる ／ Threads Studio
        </p>
      </div>
    </div>
  );
}

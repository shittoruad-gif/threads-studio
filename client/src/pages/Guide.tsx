import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, ArrowRight, CheckCircle2, MessageSquare, Calendar,
  Users, FileText, HelpCircle, BookOpen, Lightbulb, Pin, Zap,
  Link2, Repeat, ShieldCheck, Palette, ClipboardList, Clock,
  AlertCircle, Smile,
} from 'lucide-react';
import { getLoginUrl } from '@/const';

export default function Guide() {
  // ────────────────── 3分クイックスタート ──────────────────
  const quickStart = [
    {
      n: 1,
      title: 'Threadsアカウントを連携',
      time: '30秒',
      body: '事前にスマホのThreads（Instagram）にログインできる状態にしておきます。サイドバー「Threads連携」→「Threadsと連携」ボタンを押し、表示された画面で「許可」を押すだけ。複数アカウントの切り替えもダッシュボード右上から1クリックでできます。',
      icon: <Link2 className="w-6 h-6 text-blue-500" />,
    },
    {
      n: 2,
      title: 'AIプロジェクトを作成',
      time: '1分',
      body: 'サイドバー「AI投稿生成」を押すと、最初は「プロジェクト作成」へ。チャット形式の質問に答えるか、フォームで業種・地域・ターゲット・主な悩み・強みを入力します。後から編集できるので完璧でなくてOK。',
      icon: <FileText className="w-6 h-6 text-purple-500" />,
    },
    {
      n: 3,
      title: 'AIカウンセリング（強くおすすめ）',
      time: '3〜5分',
      body: '作成したプロジェクトで「カウンセリングを始める」を押すと、8問の対話に入ります。ここで「使ってよい数字・実例・特典」「絶対書きたくないこと」を答えると、AIが勝手に数字や架空のお客様の話を作ることがなくなります。',
      icon: <ClipboardList className="w-6 h-6 text-emerald-500" />,
    },
    {
      n: 4,
      title: '投稿を作る → 投稿する',
      time: '1分',
      body: '「AI投稿生成」で投稿の目的（例：予約・LINE登録を増やしたい）を選んで「AI投稿を生成」を押すだけ。できた下書きを確認して、「今すぐThreadsに投稿」または「投稿を予約する」を押せば完了です。スタイルや口調などの細かい設定は不要（必要なら「詳細設定」で調整できます）。',
      icon: <Sparkles className="w-6 h-6 text-pink-500" />,
    },
  ];

  // ────────────────── 精度を上げる（NEW機能の説明） ──────────────────
  const accuracyFeatures = [
    {
      title: 'AIカウンセリング',
      icon: <ClipboardList className="w-6 h-6 text-emerald-500" />,
      summary: '「事実だけ」で投稿を作るための前準備。AIに使っていい弾と使えない弾を最初に渡す。',
      points: [
        '8問の対話形式（選択肢チップ・例文付きで簡単）',
        '「実績数字なし」と答えれば AI も数字を書きません',
        '「絶対書きたくないこと」リストは例外なく守られます',
        '後から「Threadsノウハウをフル活用 / 自然スタイル」も選択',
      ],
      where: 'AI投稿生成画面で、まだ受診していないと「カウンセリングを始める」バナーが出ます',
    },
    {
      title: 'スタイル校正',
      icon: <Palette className="w-6 h-6 text-rose-500" />,
      summary: 'サンプル投稿を6つ提示するので、好きな雰囲気をタップで選ぶだけ。',
      points: [
        '「やわらか共感」「カジュアル」「キレ味断定」「専門家風」など6つから選択',
        '1〜3個まで選べます。多数決で AI が口調・長さ・絵文字感を学習',
        '「別のサンプルを見る」で何度でも引き直せます',
        'カウンセリング完了後に自動で誘導されます。スキップも可能',
      ],
      where: 'カウンセリング完了直後に自動表示。後から `/ai-style-calibration` で再校正もできます',
    },
    {
      title: '業界別 広告規制チェック',
      icon: <ShieldCheck className="w-6 h-6 text-amber-600" />,
      summary: '入力された業種から該当法令を自動判定。NG表現はAIが最初から書きません。',
      points: [
        '対応業種: 整体／接骨／鍼灸／美容エステ／フィットネス／飲食／歯科／医療／不動産／士業／学習塾／金融／健康食品／ペット／占い／副業情報商材',
        '景品表示法・薬機法・医療広告ガイドライン・あはき法・ステマ規制（2023年10月施行）など最新法令ベース',
        '「治る」「効く」「No.1」「先着〇名」などのNG語は推奨置換に自動変換',
        '士業・医療系は体験談・ビフォーアフターが原則禁止のためAIも控えます',
      ],
      where: 'すべての投稿生成で自動適用。設定不要',
    },
    {
      title: 'プロジェクトURL登録',
      icon: <Link2 className="w-6 h-6 text-cyan-500" />,
      summary: 'LINE登録 / Web予約 / HP / Instagram など、誘導先URLを1度登録すれば自動で使い回し。',
      points: [
        '投稿タイプに応じて AI が最適なURLを選択（CV狙いはLINE優先など）',
        '固定投稿・自動投稿・予約投稿どれでも自動的に挿入',
        '「初期設定」のURLを変えれば全投稿に反映',
      ],
      where: 'AI投稿生成画面 → 「誘導先URL」セクション',
    },
  ];

  // ────────────────── 投稿パターン早見表 ──────────────────
  const postModes = [
    {
      title: '固定投稿',
      tag: '最初に1つ作る',
      icon: <Pin className="w-5 h-5 text-amber-600" />,
      body: 'プロフィール上部に表示される自己紹介投稿。フォロー直後の人が最初に見る場所。「誰に・何を・どこで」を1投稿に凝縮。',
      when: '初期設定／月1回見直し',
    },
    {
      title: '通常投稿（手動生成）',
      tag: '日々のメイン',
      icon: <Sparkles className="w-5 h-5 text-pink-500" />,
      body: '13種類の投稿タイプから選んで生成。地元ネタ型・実績型・共感型・ストーリー型・Q&A型・〇選リスト型・あるある型 等。',
      when: '週3〜5本',
    },
    {
      title: '自動投稿',
      tag: '寝てる間に',
      icon: <Repeat className="w-5 h-5 text-emerald-500" />,
      body: '毎日決まった時間に AI が新規投稿を作って自動でThreadsに送信。短い単発投稿（350文字前後）。',
      when: '設定後はメンテ不要',
    },
    {
      title: '予約投稿',
      tag: 'タイミング指定',
      icon: <Clock className="w-5 h-5 text-blue-500" />,
      body: '今すぐ生成→明日の20時に投稿、のように日時を指定して送信。指定時刻に自動で送られる。',
      when: 'キャンペーン告知など',
    },
    {
      title: '量産（変奏）',
      tag: '当たり投稿の横展開',
      icon: <Zap className="w-5 h-5 text-yellow-500" />,
      body: 'バズった投稿を選んで「同じ構成で別バージョンを5本」のように一括生成。週次のヒット量産用。',
      when: '当たり投稿が出たら',
    },
  ];

  // ────────────────── トラブルシューティング ──────────────────
  const troubleshooting = [
    {
      q: 'AIが書いた内容がうちのお店の事実と違う',
      a: 'AIカウンセリングを受けてください。「使っていい数字」「使っていいエピソード」「絶対書きたくないこと」を最初にAIに渡すと、勝手な数字や架空エピソードを作らなくなります。AI投稿生成画面で「カウンセリングを始める」バナーから3〜5分です。',
    },
    {
      q: '文章が売り込み感が強すぎる',
      a: 'カウンセリングのQ8で「自然な投稿スタイル」を選ぶか、後から `/ai-counseling` で再受診してください。煽り型・心理トリガー・売り込みフレーズが抑えられた、穏やかな文章に切り替わります。士業・医療系・上品なブランディング向け。',
    },
    {
      q: '自動投稿が「固定投稿のような長文」になる',
      a: '修正済みです。自動投稿は短い単発投稿（350文字以内）に固定されています。もしまだ長文で出る場合はサポートまで。',
    },
    {
      q: '投稿の口調が硬い／柔らかい／自分のトーンと違う',
      a: 'スタイル校正（`/ai-style-calibration?project=<projectId>`）でサンプル投稿から好みを選び直してください。学習結果は次回生成から即反映されます。',
    },
    {
      q: '違う店舗のアカウントに切り替えたい',
      a: 'ダッシュボード右上のThreadsアカウント切替メニューで1クリック切替。プロジェクトも店舗単位で別々に作れます。',
    },
    {
      q: '「治る」「効く」など使ってはいけない言葉が出てしまった',
      a: '業界判定で該当法令を自動適用していますが、まれに通り抜けることがあります。投稿前に編集画面で確認してください。常用するNG語は AIカウンセリングのQ6「絶対NGリスト」に登録すると、以降必ず除外されます。',
    },
    {
      q: 'プロジェクトを増やしたい / 削除したい',
      a: 'AI投稿生成画面の「プロジェクトを切り替え」から新規作成。削除は各プロジェクトの設定から（無料プランは1プロジェクトまで）。',
    },
    {
      q: 'コメントへの返信を効率化したい',
      a: 'サイドバー「コメント管理」で受信コメント一覧と AI下書き返信が使えます。',
    },
  ];

  // ────────────────── 用語集 ──────────────────
  const glossary = [
    { term: 'プロジェクト', def: '店舗・ブランドごとの投稿管理単位。業種／地域／ターゲット／悩み／強みなどを保存。' },
    { term: 'AIカウンセリング', def: '8問の対話で「使ってよい事実」「絶対NG項目」をAIに教える前準備。捏造を防ぐ。' },
    { term: 'スタイル校正', def: 'サンプル投稿から好みの雰囲気を選んでAIに学ばせる機能。' },
    { term: '固定投稿', def: 'Threadsプロフィール上部に表示される投稿。自己紹介の役割。' },
    { term: '自動投稿', def: '毎日決まった時間にAIが新規投稿を生成→自動送信する機能。' },
    { term: '予約投稿', def: '指定した日時に1回だけ送信する機能。' },
    { term: 'CTA', def: 'Call To Action。「LINE登録してね」「予約はこちら」のような行動の指示。' },
    { term: 'N1分析', def: '実在の1人の顧客像をAIに伝えること。架空ペルソナより刺さる文章になる。' },
    { term: 'USP', def: 'Unique Selling Proposition。他店ではなく自分が選ばれる理由。' },
    { term: 'ノウハウ強度', def: 'Threads特有の集客技法（強い1行目・心理トリガー等）の使用度合い。フル活用 or 自然スタイル。' },
  ];

  // ────────────────── 一般FAQ ──────────────────
  const faqs = [
    { q: 'Threadsアカウントを持っていなくても使えますか？', a: 'まず Threads アカウントを作成してから連携してください。Threads は Instagram アカウントがあれば数分で開設できます。' },
    { q: '無料で使えますか？', a: '無料トライアル期間中は全機能をお試しいただけます。継続には有料プランをご契約ください。' },
    { q: 'スマホからも使えますか？', a: 'はい。スマホ／タブレット／PC、レスポンシブ対応です。' },
    { q: '投稿の効果は計測できますか？', a: 'サイドバー「投稿分析」で、過去投稿のインプレッション／いいね／コメントを一覧確認できます。' },
    { q: '何文字まで投稿できますか？', a: 'Threadsの仕様で1投稿あたり最大500文字。本ツールは安全に480文字で切り詰めます。自動投稿は350文字程度に最適化。' },
    { q: 'ハッシュタグは入りますか？', a: 'Threadsではハッシュタグは効果が薄く、業者っぽさを出すため、本ツールでは投稿に一切入れない仕様です。生成・プレビュー・自動投稿のすべてで # は付きません。' },
    { q: '解約はどこからできますか？', a: 'ダッシュボードの「解約する」ボタンからいつでも手続きできます。日割り計算ではなく、お支払い済み期間の終了まで利用できます。7日間の無料トライアル中に解約すれば料金は発生しません。' },
    { q: '広告規制でNGになりそうな表現は止めてくれますか？', a: '業界別自動判定で景表法・薬機法・医療広告ガイドライン・ステマ規制（2023年10月）など最新法令ベースで先回りしてNG語を回避します。ただし投稿前の最終チェックはご自身でお願いします。' },
    { q: 'カウンセリングは何度も受けられますか？', a: 'はい。お店の状況が変わったら（新サービス開始・実績更新など）再受診できます。最新の回答が以降の生成に反映されます。' },
    { q: 'スタイル校正で気に入る雰囲気がありません', a: '「別のサンプルを見る」を押してください。テンプレ集からランダムに別の6パターンが提示されます。' },
  ];

  // ────────────────── 効果的な使い方のコツ ──────────────────
  const tips = [
    { title: '初日は固定投稿を作る', body: 'AI投稿生成で「固定投稿」タイプを選んで作成→Threadsでプロフィール上部に固定。新しいフォロワーが最初に見る場所。', icon: <Pin className="w-5 h-5 text-amber-500" /> },
    { title: 'カウンセリングは絶対受ける', body: '受けると受けないでAI生成精度が大きく変わります。3〜5分の投資で以降ずっと精度が上がる。', icon: <ClipboardList className="w-5 h-5 text-emerald-500" /> },
    { title: '20〜22時に投稿', body: 'Threadsはこの時間帯のエンゲージメントが高め。予約投稿で時間を固定するのがオススメ。', icon: <Clock className="w-5 h-5 text-blue-500" /> },
    { title: 'コメント返信は早めに', body: '受信3時間以内の返信がエンゲージメント維持に効きます。「コメント管理」のAI下書きで素早く対応。', icon: <MessageSquare className="w-5 h-5 text-green-500" /> },
    { title: '当たり投稿は量産する', body: '伸びた投稿を「量産（変奏）」で5本一気に作って、来週分の予約に流し込む。', icon: <Zap className="w-5 h-5 text-yellow-500" /> },
    { title: '週1で振り返る', body: '「投稿分析」で当たり外れの傾向を見て、次週のスタイル校正に反映。', icon: <Lightbulb className="w-5 h-5 text-purple-500" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-card fixed top-0 left-0 right-0 z-50 border-b border-border/50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <Sparkles className="w-6 h-6 text-primary" />
              <span className="text-xl font-bold gradient-text">Threads Studio</span>
            </div>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link href="/dashboard"><Button variant="ghost" size="sm">ダッシュボード</Button></Link>
            <Link href="/faq"><Button variant="ghost" size="sm">FAQ</Button></Link>
            <a href={getLoginUrl()}>
              <Button size="sm" className="neon-border">
                <Sparkles className="w-4 h-4 mr-2" />
                無料で始める
              </Button>
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-28 pb-8 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <Badge className="mb-4">
            <BookOpen className="w-3 h-3 mr-1" />
            使い方ガイド
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 gradient-text">
            初日に何をすればいいか、全部書いてあります
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground">
            読まなくてもいい設計を目指していますが、迷ったらこのページに戻ってきてください。<br className="hidden sm:block" />
            上から順に進めば、3分で最初の投稿が出せます。
          </p>
        </div>
      </section>

      {/* TOC */}
      <section className="px-4 pb-8">
        <div className="container mx-auto max-w-4xl">
          <Card className="glass-card p-4 sm:p-6">
            <p className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              目次
            </p>
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              <a href="#quickstart" className="hover:text-primary">① 3分クイックスタート（はじめての方）</a>
              <a href="#accuracy" className="hover:text-primary">② AIの精度を最大化する3つの機能</a>
              <a href="#modes" className="hover:text-primary">③ 投稿モード早見表（どれを使う？）</a>
              <a href="#tips" className="hover:text-primary">④ 効果を出すための6つのコツ</a>
              <a href="#trouble" className="hover:text-primary">⑤ よくあるつまずきと解決策</a>
              <a href="#faq" className="hover:text-primary">⑥ FAQ</a>
              <a href="#glossary" className="hover:text-primary">⑦ 用語集</a>
            </div>
          </Card>
        </div>
      </section>

      {/* ① クイックスタート */}
      <section id="quickstart" className="py-12 px-4">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">① 3分クイックスタート</h2>
          <p className="text-sm text-muted-foreground mb-8">登録直後にこの順で進めば、最初の投稿が出ます。</p>
          <div className="space-y-4">
            {quickStart.map((step) => (
              <Card key={step.n} className="glass-card p-5 hover-lift">
                <div className="flex gap-4 sm:gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xl">
                      {step.n}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {step.icon}
                      <h3 className="text-lg sm:text-xl font-semibold">{step.title}</h3>
                      <Badge variant="secondary" className="text-xs">所要 {step.time}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <Link href="/ai-generate">
              <Button size="lg" className="neon-border">
                <Sparkles className="w-4 h-4 mr-2" />
                AI投稿生成を開く
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ② 精度を上げる */}
      <section id="accuracy" className="py-12 px-4 bg-muted/30">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">② AIの精度を最大化する3つの機能</h2>
          <p className="text-sm text-muted-foreground mb-8">
            初期設定で1回やっておくと、以降ずっとAIの精度が上がります。
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {accuracyFeatures.map((f, i) => (
              <Card key={i} className="glass-card p-5">
                <div className="flex items-start gap-3 mb-3">
                  {f.icon}
                  <div>
                    <h3 className="font-semibold text-lg">{f.title}</h3>
                    <p className="text-sm text-muted-foreground">{f.summary}</p>
                  </div>
                </div>
                <ul className="space-y-1 mb-3 text-sm">
                  {f.points.map((p, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{p}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-primary/80 border-t pt-2">📍 {f.where}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ③ 投稿モード早見表 */}
      <section id="modes" className="py-12 px-4">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">③ 投稿モード早見表（どれを使う？）</h2>
          <p className="text-sm text-muted-foreground mb-8">
            目的に合わせて使い分けてください。最初は固定投稿 → 自動投稿でOK。
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {postModes.map((m, i) => (
              <Card key={i} className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  {m.icon}
                  <h3 className="font-semibold">{m.title}</h3>
                </div>
                <Badge variant="outline" className="text-xs mb-2">{m.tag}</Badge>
                <p className="text-sm text-muted-foreground mb-2">{m.body}</p>
                <p className="text-xs text-primary/80">推奨頻度: {m.when}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ④ Tips */}
      <section id="tips" className="py-12 px-4 bg-muted/30">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">④ 効果を出すための6つのコツ</h2>
          <p className="text-sm text-muted-foreground mb-8">運用の現場でよく効くポイントだけ。</p>
          <div className="grid md:grid-cols-2 gap-4">
            {tips.map((t, i) => (
              <Card key={i} className="glass-card p-5">
                <div className="flex items-start gap-3">
                  {t.icon}
                  <div>
                    <h3 className="font-semibold mb-1">{t.title}</h3>
                    <p className="text-sm text-muted-foreground">{t.body}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ⑤ トラブルシューティング */}
      <section id="trouble" className="py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">⑤ よくあるつまずきと解決策</h2>
          <p className="text-sm text-muted-foreground mb-8">
            ユーザの皆様から実際にあった質問を解決策付きでまとめました。
          </p>
          <div className="space-y-3">
            {troubleshooting.map((t, i) => (
              <Card key={i} className="glass-card p-5">
                <h3 className="font-semibold mb-2 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  {t.q}
                </h3>
                <p className="text-sm text-muted-foreground pl-7 leading-relaxed">{t.a}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ⑥ FAQ */}
      <section id="faq" className="py-12 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">⑥ FAQ</h2>
          <p className="text-sm text-muted-foreground mb-8">サブスクリプション・利用範囲・仕様の質問はこちら。</p>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <Card key={i} className="glass-card p-5">
                <h3 className="font-semibold mb-2 flex items-start gap-2">
                  <HelpCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  {f.q}
                </h3>
                <p className="text-sm text-muted-foreground pl-7 leading-relaxed">{f.a}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ⑦ 用語集 */}
      <section id="glossary" className="py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">⑦ 用語集</h2>
          <p className="text-sm text-muted-foreground mb-8">画面で出てくる用語の意味。</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {glossary.map((g, i) => (
              <Card key={i} className="glass-card p-4">
                <p className="font-semibold text-primary mb-1">{g.term}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{g.def}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-3xl text-center">
          <Smile className="w-10 h-10 mx-auto mb-4 text-primary" />
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            まだ不明点があれば、お気軽にどうぞ
          </h2>
          <p className="text-base text-muted-foreground mb-6">
            このページに載っていない質問は、設定→サポートからメッセージください。
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/dashboard">
              <Button size="lg" className="neon-border">
                <Sparkles className="w-4 h-4 mr-2" />
                ダッシュボードへ
              </Button>
            </Link>
            <Link href="/faq">
              <Button size="lg" variant="outline">
                FAQも見る
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

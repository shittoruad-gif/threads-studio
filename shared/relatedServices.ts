/**
 * 「他に興味のあるサービス」アンケートの選択肢＝株式会社しっとるの関連サービス。
 * アンケートのダイアログ（client）と、自動案内メール（server）で同じ定義を使う。
 *
 * description は各サービスの実体（実際に作ったアプリ）に基づく一言説明。
 *
 * ★ url / sample / price を書くと、自動案内メールに
 *   「詳しく見る」「サンプルを見る」ボタンと料金の一言が入る。
 *   ページが無いサービスは url を null にする。その場合メールは相談ボタンだけになる。
 *   ここに書いた料金はそのままお客様に届くので、確定していない金額は書かない。
 */
/** サービス紹介ページ（/services/<slug>）に載せる中身。数字・料金は確定しているものだけ書く */
export interface RelatedServicePage {
  /** 見出し（サービス名より少し説明的に） */
  headline: string;
  /** こんなお悩みに */
  pains: string[];
  /** 流れ（who: お客様／おまかせ／お店） */
  steps: { who: string; text: string }[];
  /** 得られるもの */
  outputs: string[];
  /** 申し込み・相談のボタン */
  cta: { label: string; url: string };
}

export interface RelatedService {
  /** アンケートに保存されるラベル（表示名。これで突き合わせる） */
  label: string;
  /** 紹介ページのURLの一部（/services/<slug>）。メールのリンク先にもなる */
  slug: string;
  /** 紹介ページの中身 */
  page: RelatedServicePage;
  /** 一言説明（ダイアログ・メール共通） */
  description: string;
  /** サービス紹介ページ（公開URL）。無ければ null */
  url: string | null;
  /** 実物をお見せするページ（LPのサンプル集など）。あるサービスだけ */
  sample?: { url: string; label: string; note?: string };
  /** メールに載せる料金の一言（税込・確定しているものだけ） */
  price?: string;
}

export const RELATED_SERVICES: RelatedService[] = [
  {
    label: 'LPの作成',
    slug: 'lp-seisaku',
    page: {
      headline: '申し込みに直結する「1枚ページ」をつくります',
      pains: [
        '広告をクリックした先が普通のホームページで、申し込みにつながらない',
        'ページを作りたいが、何を載せればいいか分からない',
      ],
      steps: [
        { who: 'お客様', text: '業種・強み・料金・写真を伝えるだけ' },
        { who: 'おまかせ', text: '集客LPの黄金構成（悩み共感→解決策→お客様の声→料金→FAQ→申込）で設計' },
        { who: 'おまかせ', text: 'AIで初稿を高速作成 → スタッフがデザイン・文言を仕上げ' },
        { who: 'おまかせ', text: '計測タグ・LINE導線を組み込み、公開まで対応' },
      ],
      outputs: [
        'スマホ最適化された申込直結のLP 1ページ',
        '広告・公式LINEと連携できる計測タグ・LINE導線込み',
        '公開後の差し替え・改善のご相談（修正は月3回まで無料）',
      ],
      cta: { label: 'LP制作を相談する', url: 'mailto:shittoru@s-toru.com?subject=' + encodeURIComponent('LP制作について') },
    },
    description: '広告やSNSの受け皿になる「申し込みに直結する1枚ページ」を、成約実績のある黄金構成で制作します。',
    url: 'https://shittoruad-gif.github.io/lp-seisaku-lp/',
    sample: {
      url: 'https://shittoruad-gif.github.io/shittoru-lp-samples/',
      label: '実際のLPサンプルを見る',
      note: '整骨院（交通事故）・整体院・ピラティス・ヘアサロン・エステの5業種を、スマホでそのままご覧いただけます。',
    },
    // 2026-09-02 三上様確認：初期費用0円・月額14,300円・1年契約が現行。
    // 公開LP（lp-seisaku-lp）の「9,900円買い切り」表記は古いので、そちらも要修正。
    price: '初期費用0円・月額14,300円（税込／1年契約・修正は月3回まで無料）',
  },
  {
    label: 'Instagram広告の運用代行',
    slug: 'ig-ads-agency',
    page: {
      headline: 'Instagram広告を、企画から毎日の数値チェックまでまるごと代行',
      pains: [
        '広告を出したいが、何から始めればいいか分からない',
        '代理店は高額で、何をしているのか中身が見えない',
        '広告費を使いすぎてしまわないか不安',
      ],
      steps: [
        { who: 'お客様', text: '店舗情報と週予算を決めるだけ（例：1店舗 週5,000円）' },
        { who: 'おまかせ', text: '毎週、店舗専用の広告ページ（LP）と広告を作成' },
        { who: 'おまかせ', text: '医療広告規制など表現ルールを自動チェックしてから配信' },
        { who: 'おまかせ', text: '毎日実績を取得してダッシュボード更新。予算超過は自動で配信停止' },
        { who: 'お客様', text: 'ダッシュボードと報告を見るだけ。判断が必要な時だけ連絡が届く' },
      ],
      outputs: [
        '毎週の新しい広告＋専用LP',
        '勝ち広告が一目で分かるダッシュボード',
        '予算の安全装置（上限で自動停止・毎朝の金銭監査）',
      ],
      cta: { label: '運用代行を相談する', url: 'mailto:shittoru@s-toru.com?subject=' + encodeURIComponent('Instagram広告の運用代行について') },
    },
    description: '広告の企画・画像や動画の作成・配信・毎日の数値チェックまで、こちらでまるごと運用します。',
    url: 'https://ig-ads.s-toru.com/',
    price: '広告費の20%（最低 月11,000円・税込）',
  },
  {
    label: 'Instagram広告を自分で運用（マカセル）',
    slug: 'makaseru',
    page: {
      headline: '広告文・画像・動画をAIがつくる、セルフ運用の広告ソフト',
      pains: [
        '広告の文章・画像・動画を自分で用意できない',
        '代理店に頼むと高い。でも自分でやると何が正解か分からない',
      ],
      steps: [
        { who: 'お客様', text: '商材（メニュー）を登録するだけ' },
        { who: 'おまかせ', text: '広告コピー・画像・動画をAIが複数案まとめて自動生成（規制チェック付き）' },
        { who: 'お客様', text: '気に入った案を選んで、コピペで出稿（番号付きの手順キット付き）' },
        { who: 'おまかせ', text: '配信結果をAIが分析し、「次にどうすべきか」を提案' },
      ],
      outputs: [
        'すぐ出稿できる広告素材一式（文章・画像・動画）',
        '結果の分析レポートと改善アドバイス',
        '運用の相談ができるAIチャット',
      ],
      cta: { label: 'マカセルの紹介ページを見る', url: 'https://shittoruad-gif.github.io/makaseru-lp/' },
    },
    description: '代理店に頼まず自分で広告を出せるソフトです。広告文・画像・動画をAIが作り、結果の分析まで自動で行います。',
    url: 'https://shittoruad-gif.github.io/makaseru-lp/',
    price: '月11,000円〜（税込）',
  },
  {
    label: '公式LINEの作成',
    slug: 'line-create',
    page: {
      headline: '予約と再来の受け皿になる公式LINEを、開設から作り込みまで代行',
      pains: [
        '公式LINEを作りたいが、設定が多くて手が止まる',
        '作ったものの、あいさつ文のまま放置している',
        '新規は来るが、リピートにつながらない',
      ],
      steps: [
        { who: 'お客様', text: 'お店の情報・メニュー・よくある質問を伝えるだけ' },
        { who: 'おまかせ', text: '公式LINEの開設・初期設定・あいさつ文・自動応答・リッチメニューを作り込み' },
        { who: 'おまかせ', text: '友だち追加直後からのステップ配信で自動フォロー' },
        { who: 'お客様', text: '広告・チラシ・SNSにQRやリンクを貼るだけで、登録が集まりはじめます' },
      ],
      outputs: [
        'すぐ使える公式LINEアカウント一式（あいさつ・自動応答・リッチメニュー）',
        'ステップ配信・クーポン・誕生日配信などリピートの仕組み',
        '運用プラン（30日間無料）でそのまま運用を続けられます',
      ],
      cta: { label: '公式LINEの作成を申し込む', url: 'https://keiro.s-toru.com/' },
    },
    description: '予約・再来の受け皿になる公式LINEアカウントの開設から初期設定、あいさつ・自動応答の作り込みまで代行します。',
    url: 'https://keiro.s-toru.com/',
    price: 'LINE制作パック 16,500円（初回のみ・税込）。運用プラン（月9,800円）が30日間無料で付きます',
  },
  {
    label: '公式LINEトラッキングツール',
    slug: 'line-tracking',
    page: {
      headline: '「どこから公式LINEに登録されたか」を、認証画面なしで計測',
      pains: [
        '広告・チラシ・SNSの、どれが効いたのか分からない',
        '公式LINEの友だちは増えているが、次の一手が決められない',
      ],
      steps: [
        { who: 'お客様', text: '広告・チラシ・SNSごとに専用リンク（QR）を発行して貼るだけ' },
        { who: 'おまかせ', text: '友だち追加を経路ごとに自動で紐づけ、「どこから来たか」を見える化' },
        { who: 'おまかせ', text: '経路ごとにステップ配信を出し分け。新規／通院中も自動で振り分け' },
        { who: 'お客様', text: 'ダッシュボードで「効いた経路」を確認し、そこに予算を集中' },
      ],
      outputs: [
        '経路別の友だち追加ダッシュボード',
        '経路ごとの自動フォロー配信',
        'Threads Studio の固定投稿からの流入も、この仕組みで計測できます',
      ],
      cta: { label: '14日間無料で試す', url: 'https://keiro.s-toru.com/' },
    },
    description: 'どの広告・投稿から公式LINEに登録されたかを、認証画面なしで計測します。流入経路ごとの自動フォロー配信もできます。',
    url: 'https://keiro.s-toru.com/',
    price: 'ライト 月4,980円／プロ 月9,800円（税込）。14日間無料・契約期間の縛りなし',
  },
  {
    label: '口コミ生成アプリ',
    slug: 'kuchikomi',
    page: {
      headline: '「口コミを書いてください」が、投稿まで届くようになります',
      pains: [
        'お願いしても、口コミを書いてもらえない',
        'お客様が「何を書けばいいか分からない」で止まってしまう',
      ],
      steps: [
        { who: 'お客様（来店客）', text: 'お店のQRから開いて、いくつかの質問に答えるだけ' },
        { who: 'おまかせ', text: 'AIがGoogleマップ用の口コミの下書きを作成' },
        { who: 'お客様（来店客）', text: '内容を確認して、そのままGoogleマップに投稿' },
        { who: 'お店', text: '質問項目やメニューは、お店に合わせてこちらで設定します' },
      ],
      outputs: [
        'お店専用の口コミ作成ページ（QRつき）',
        'お店に合わせた質問項目',
        '毎月のご利用状況レポート',
      ],
      cta: { label: '口コミ生成アプリを相談する', url: 'https://kuchikomi.s-toru.com/' },
    },
    description: 'お客様は質問に答えるだけ。AIがGoogleマップ用の口コミの下書きを作るので、「書いてください」が投稿まで届きます。',
    url: 'https://kuchikomi.s-toru.com/',
  },
  {
    label: '予約・店舗運営システム（サロンカルテ）',
    slug: 'salon-karte',
    page: {
      headline: 'アプリ不要・ログイン不要。お店専用のネット予約と運営管理',
      pains: [
        '予約サイトの月額費用・送客手数料が重い',
        '電話対応に追われ、営業時間外の予約を取りこぼす',
        '二重予約・入れ忘れなどの人為ミスが怖い',
      ],
      steps: [
        { who: 'お客様（来店客）', text: 'メニュー→担当者→日時→連絡先の順に選ぶだけ（スマホ最適化）' },
        { who: 'おまかせ', text: '空き枠は営業時間・シフト・他の予約から自動計算。二重予約は仕組みで防止' },
        { who: 'おまかせ', text: '予約が入るとスタッフのLINEグループへ即通知。お客様には確認・前日リマインド' },
        { who: 'お店', text: '予約表で確認するだけ。手動予約・予定・シフトもその場で登録' },
      ],
      outputs: [
        '店舗専用の予約ページ（担当者別・店舗別・メニュー別のURL/QR）',
        '予約表つき管理画面（顧客台帳・失客アラート・回数券管理）',
        'LINE・メールの自動通知（予約確認・前日リマインド・来店後のお礼）',
      ],
      cta: { label: '導入を相談する', url: 'mailto:shittoru@s-toru.com?subject=' + encodeURIComponent('予約システム（サロンカルテ）について') },
    },
    description: 'アプリ不要・ログイン不要でお客様の予約が完結する、店舗専用のネット予約システムです。掲載料も送客手数料もかかりません。',
    url: null,
    // 料金は保留。営業資料（Notion）の早見表では「個別見積り／未整理」、
    // 別途「1店舗19,800円・3店舗まで39,800円・5店舗以上79,800円」の記載もあり食い違っている。
    // 自動でお客様に届く文面なので、確定するまで金額は書かない。
  },
  {
    label: '交通事故の患者さん対応サポート',
    slug: 'jiko-support',
    page: {
      headline: '交通事故の患者さんの受け入れから、保険会社対応・院内体制まで',
      pains: [
        '交通事故の患者さんが来ても、手続きや保険会社とのやりとりに自信がない',
        '受け入れたいが、院内の体制づくりから何をすればいいか分からない',
      ],
      steps: [
        { who: 'お客様', text: 'いまの受け入れ状況と、困っていることをお聞かせください' },
        { who: 'おまかせ', text: '受け入れの流れ・書類・保険会社とのやりとりを、院に合わせて整理' },
        { who: 'おまかせ', text: '院内の案内・スタッフの対応手順まで一緒に作ります' },
      ],
      outputs: [
        '交通事故の患者さん対応の手順書（院専用）',
        '保険会社とのやりとりの型',
        '継続的なご相談（弊社が最も長く携わってきた分野です）',
      ],
      cta: { label: '交通事故対応を相談する', url: 'mailto:shittoru@s-toru.com?subject=' + encodeURIComponent('交通事故の患者さん対応サポートについて') },
    },
    description: '交通事故の患者さんの受け入れ・保険会社とのやりとり・院内の体制づくりをご支援します。弊社が最も長く携わってきた分野です。',
    url: null,
  },
  {
    label: '店舗集客まるっとパック（オールインワン）',
    slug: 'all-in-one',
    page: {
      headline: 'LP → 広告 → Threads → 公式LINE → 口コミ → 予約まで、一気通貫でお任せ',
      pains: [
        '集客の道具がバラバラで、どれが効いているのか分からない',
        'それぞれ別の業者に頼んでいて、連携が取れていない',
      ],
      steps: [
        { who: 'お客様', text: 'お店の状況と目標をお聞かせください（毎月30分の個別相談つき）' },
        { who: 'おまかせ', text: 'LP・広告・Threads・公式LINE・口コミ・予約を、ひとつの流れとして設計' },
        { who: 'おまかせ', text: '流入の計測をひとつにまとめ、効いているところに予算を集中' },
      ],
      outputs: [
        '集客の全体設計と、各ツールの連携',
        '毎月の数字にもとづく改善提案（月30分の個別相談）',
        '窓口がひとつになる安心感',
      ],
      cta: { label: 'まるっとパックを相談する', url: 'mailto:shittoru@s-toru.com?subject=' + encodeURIComponent('店舗集客まるっとパックについて') },
    },
    description: 'LP → 広告 → Threads → 公式LINE → 口コミ → 予約まで、集客を一気通貫でお任せいただけるプランです。毎月30分の個別相談つき。',
    url: null,
  },
];

/**
 * 表示名を変えた選択肢の読み替え表（過去の回答を取りこぼさないため）。
 *
 * 「Instagram広告」は 2026-09-02 まで1つの選択肢で、説明文は
 * セルフ運用ソフト（マカセル）のものだった。運用代行と分けたので、
 * それ以前の回答はマカセル希望として扱う。
 */
const LEGACY_LABEL_ALIASES: Record<string, string> = {
  'Instagram広告': 'Instagram広告を自分で運用（マカセル）',
};

/** ラベル配列から該当サービス定義を返す（順序は定義順・重複は除く） */
export function servicesFromLabels(labels: string[]): RelatedService[] {
  const set = new Set(labels.map((l) => LEGACY_LABEL_ALIASES[l] ?? l));
  return RELATED_SERVICES.filter((s) => set.has(s.label));
}

/** 案内メール等の問い合わせ先（会社の窓口メール） */
export const RELATED_SERVICES_CONTACT_EMAIL = 'shittoru@s-toru.com';

/** 集客サービス全体の流れをまとめた案内ページ（メールの締めで案内する） */
export const RELATED_SERVICES_OVERVIEW_URL = 'https://lp.s-toru.com/';

/** slug からサービス定義を返す */
export function serviceBySlug(slug: string): RelatedService | undefined {
  return RELATED_SERVICES.find((s) => s.slug === slug);
}

/** サービス紹介ページのURL（Threads Studio 内の /services/<slug>） */
export function servicePageUrl(base: string, service: RelatedService): string {
  return `${base.replace(/\/$/, '')}/services/${service.slug}`;
}

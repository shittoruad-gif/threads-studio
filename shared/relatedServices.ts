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
export interface RelatedService {
  /** アンケートに保存されるラベル（表示名。これで突き合わせる） */
  label: string;
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
    description: '広告やSNSの受け皿になる「申し込みに直結する1枚ページ」を、成約実績のある黄金構成で制作します。',
    url: 'https://shittoruad-gif.github.io/lp-seisaku-lp/',
    sample: {
      url: 'https://shittoruad-gif.github.io/shittoru-lp-samples/',
      label: '実際のLPサンプルを見る',
      note: '整骨院（交通事故）・整体院・ピラティス・ヘアサロン・エステの5業種を、スマホでそのままご覧いただけます。',
    },
    price: 'HTMLファイル納品 9,900円／公開＋1年サポート 14,300円（税込・どちらも月額費用なし）',
  },
  {
    label: 'Instagram広告の運用代行',
    description: '広告の企画・画像や動画の作成・配信・毎日の数値チェックまで、こちらでまるごと運用します。',
    url: 'https://ig-ads.s-toru.com/',
    price: '広告費の20%（最低 月11,000円・税込）',
  },
  {
    label: 'Instagram広告を自分で運用（マカセル）',
    description: '代理店に頼まず自分で広告を出せるソフトです。広告文・画像・動画をAIが作り、結果の分析まで自動で行います。',
    url: 'https://shittoruad-gif.github.io/makaseru-lp/',
    price: '月11,000円〜（税込）',
  },
  {
    label: '公式LINEの作成',
    description: '予約・再来の受け皿になる公式LINEアカウントの開設から初期設定、あいさつ・自動応答の作り込みまで代行します。',
    url: 'https://keiro.s-toru.com/',
    price: 'LINE制作パック 16,500円（初回のみ・税込）。運用プラン（月9,800円）が30日間無料で付きます',
  },
  {
    label: '公式LINEトラッキングツール',
    description: 'どの広告・投稿から公式LINEに登録されたかを、認証画面なしで計測します。流入経路ごとの自動フォロー配信もできます。',
    url: 'https://keiro.s-toru.com/',
    price: 'ライト 月4,980円／プロ 月9,800円（税込）。14日間無料・契約期間の縛りなし',
  },
  {
    label: '口コミ生成アプリ',
    description: 'お客様は質問に答えるだけ。AIがGoogleマップ用の口コミの下書きを作るので、「書いてください」が投稿まで届きます。',
    url: 'https://kuchikomi.s-toru.com/',
  },
  {
    label: '予約・店舗運営システム（サロンカルテ）',
    description: 'アプリ不要・ログイン不要でお客様の予約が完結する、店舗専用のネット予約システムです。掲載料も送客手数料もかかりません。',
    url: null,
    // 料金は保留。営業資料（Notion）の早見表では「個別見積り／未整理」、
    // 別途「1店舗19,800円・3店舗まで39,800円・5店舗以上79,800円」の記載もあり食い違っている。
    // 自動でお客様に届く文面なので、確定するまで金額は書かない。
  },
  {
    label: '交通事故の患者さん対応サポート',
    description: '交通事故の患者さんの受け入れ・保険会社とのやりとり・院内の体制づくりをご支援します。弊社が最も長く携わってきた分野です。',
    url: null,
  },
  {
    label: '店舗集客まるっとパック（オールインワン）',
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

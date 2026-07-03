/**
 * 「他に興味のあるサービス」アンケートの選択肢＝株式会社しっとるの関連サービス。
 * アンケートのダイアログ（client）と、自動案内メール（server）で同じ定義を使う。
 *
 * description は各サービスの実体（実際に作ったアプリ）に基づく一言説明。
 */
export interface RelatedService {
  /** アンケートに保存されるラベル（表示名。これで突き合わせる） */
  label: string;
  /** 一言説明（ダイアログ・メール共通） */
  description: string;
}

export const RELATED_SERVICES: RelatedService[] = [
  {
    label: '公式LINEの作成',
    description: '予約・再来の受け皿になる公式LINEアカウントの開設・初期設定を代行します。',
  },
  {
    label: 'LPの作成',
    description: '業種を入力するだけで、AIが集客用ランディングページ（治療院の黄金構成）を自動生成。予約につながる1枚ページを制作します。',
  },
  {
    label: '公式LINEトラッキングツール',
    description: 'どの広告・投稿から公式LINEに登録されたかを認証画面なしで計測。流入経路別の自動ステップ配信もできる計測ツールです。',
  },
  {
    label: '口コミ生成アプリ',
    description: 'お客様のGoogle口コミ投稿を自然に後押しし、店舗の口コミ評価を増やすアプリです。',
  },
  {
    label: 'Instagram広告',
    description: '代理店に頼らず、Instagram/Meta広告を自分で運用できるSaaS。AIが広告文・動画まで作成します。',
  },
  {
    label: '店舗集客まるっとパック（オールインワン）',
    description: 'LP → 広告 → Threads → 公式LINE → 口コミまで、集客を一気通貫で支援するオールインワンです。',
  },
];

/** ラベル配列から該当サービス定義を返す（順序は定義順） */
export function servicesFromLabels(labels: string[]): RelatedService[] {
  const set = new Set(labels);
  return RELATED_SERVICES.filter((s) => set.has(s.label));
}

/** 案内メール等の問い合わせ先（会社の窓口メール） */
export const RELATED_SERVICES_CONTACT_EMAIL = 'shittoru@s-toru.com';

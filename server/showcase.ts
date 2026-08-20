/**
 * 実例ショーケース：実際に反応が取れた投稿を、匿名化して紹介ページに載せる。
 *
 * 目的：
 *   紹介ページ（/tour）に「こういう投稿が実際に伸びています」を出す。
 *   手で書いた作り話ではなく、**本番で実際に配信され数字が出た投稿**だけを使う。
 *   新しく伸びた投稿が出れば自動で入れ替わるので、説明を書き直す必要がない。
 *
 * 絶対条件：
 *   1. どのお店の投稿か分からないこと。アカウント名・店名は出さない。
 *      投稿文の中にも店名・駅名・URL・合言葉が入っているので、**本文も伏せる**。
 *   2. 掲載を拒否したユーザー（users.showcaseOptOut）の投稿は一切使わない。
 *   3. 数字は実測値をそのまま出す。盛らない。
 *
 * ここでは判定と伏せ字化だけを行い、DBアクセスは呼び出し側に任せる（テスト可能にするため）。
 */

/** 掲載候補として最低限必要な閲覧数。これ未満は「反応が取れた」と言えない */
export const MIN_IMPRESSIONS = 800;

/** 「反応が取れた」と言うために最低限必要な、いいね＋返信の合計 */
export const MIN_REACTIONS = 3;

/**
 * 公開する冒頭の文字数。
 *
 * 全文を載せると「これなら自分で書ける」と読まれてしまい、
 * 数字（実績）だけが伝わって導入の理由が消える。
 * 反応が出たことは数字で示しつつ、**どう書いたかは見せない**。
 */
export const EXCERPT_CHARS = 42;

/**
 * 掲載に必要な最低文字数。
 * 冒頭（EXCERPT_CHARS）を見せてなお伏せる続きが残る長さにする。
 */
export const MIN_CHARS = EXCERPT_CHARS + 20;

/** 掲載する最大件数 */
export const MAX_ITEMS = 6;

/**
 * 同じ店舗から載せる最大件数。
 * 上限を設けないと、投稿数の多い1店舗だけで一覧が埋まり、
 * 「1店舗しか使っていない」ように見えてしまう。
 */
export const MAX_PER_OWNER = 2;

export type ShowcaseSource = {
  postContent: string | null;
  impressions: number;
  likes: number;
  replies: number;
  postedAt: Date | null;
  /** 伏せ字化に使う、その店だけの固有語 */
  storeName?: string | null;
  businessType?: string | null;
  area?: string | null;
  localTerms?: string | null;
  /** 掲載拒否フラグ */
  showcaseOptOut?: boolean | null;
  /** 同一店舗の投稿ばかり並ばないようにするための識別子（表示はしない） */
  ownerKey?: string | number | null;
};

export type ShowcaseItem = {
  /** 冒頭のさわりだけ。続きは返さない（下の buildShowcase のコメント参照） */
  excerpt: string;
  /** 伏せた残りの文字数。「これだけの続きがある」ことだけ伝える */
  hiddenChars: number;
  /** 伏せた続きの行数（ぼかし表示の行数に使う） */
  hiddenLines: number;
  impressions: number;
  likes: number;
  replies: number;
  /** 「整体院・岡山県」のような、店が特定できない範囲の説明 */
  label: string;
  postedAt: string | null;
};

const PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県',
  '埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県',
  '岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県',
  '佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県',
];

/** 業種テキストを、店が絞り込めない粒度の一般名にまとめる */
const BUSINESS_LABELS: Array<[RegExp, string]> = [
  [/整体|カイロ|骨盤/, '整体院'],
  [/整骨|接骨|鍼灸|はり|きゅう/, '整骨院・鍼灸院'],
  [/ピラティス|ヨガ/, 'ピラティススタジオ'],
  [/ジム|パーソナル|トレーニング/, 'パーソナルジム'],
  [/美容室|ヘアサロン|美容院|理容/, '美容室'],
  [/ネイル|まつげ|まつ毛|アイラッシュ/, 'ネイル・アイラッシュサロン'],
  [/エステ|痩身|脱毛/, 'エステサロン'],
  [/歯科/, '歯科医院'],
  [/クリニック|医院|皮膚科|内科/, 'クリニック'],
  [/カフェ|飲食|レストラン|居酒屋|ラーメン/, '飲食店'],
  [/教室|スクール|塾/, '教室・スクール'],
  [/不動産/, '不動産'],
  [/広告|マーケ|コンサル|制作|web|システム/i, '事業者向けサービス'],
];

/** 業種名を一般カテゴリへ。該当しなければ「店舗」 */
export function generalizeBusiness(businessType: string | null | undefined): string {
  const b = (businessType ?? '').trim();
  if (!b) return '店舗';
  for (const [re, label] of BUSINESS_LABELS) if (re.test(b)) return label;
  return '店舗';
}

/** 住所テキストから都道府県だけを取り出す。分からなければ null */
export function prefectureOf(area: string | null | undefined): string | null {
  const a = (area ?? '').trim();
  if (!a) return null;
  return PREFECTURES.find((p) => a.includes(p)) ?? null;
}

/**
 * 投稿本文から、その店が特定できる情報を伏せる。
 *
 * 消す対象：
 *   - 店名（プロジェクト登録値）
 *   - 商圏の語（最寄り駅・町名など localTerms の各行）
 *   - 市区町村名（area）
 *   - URL、@ユーザー名、電話番号
 *   - 「◯◯駅」「◯◯店」のような未登録の固有名（保険）
 */
export function redact(text: string, src: ShowcaseSource): string {
  let out = text;

  // 1. 登録済みの固有語（長いものから消さないと部分一致で崩れる）
  const own: string[] = [];
  // 店名・地域は複数店舗ぶんが改行区切りで入ることがある
  for (const field of [src.storeName, src.area]) {
    for (const line of (field ?? '').split(/\r?\n/)) {
      const t = line.trim();
      if (t) own.push(t);
    }
  }
  for (const line of (src.localTerms ?? '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    own.push(t);
    // 「新倉敷駅から車で約12分」→「新倉敷駅」と「新倉敷」の両方を伏せる。
    // 本文では「新倉敷・玉島周辺」のように“駅”を省いて書かれることが多く、
    // 駅つきだけを消しても地名が残ってしまう（実データで検出）。
    const m = t.match(/^(.+?)駅/);
    if (m) { own.push(`${m[1]}駅`); own.push(m[1]); }
  }
  // 「岡山県倉敷市玉島」のような住所は、市区町村・町名の単位にまで分解して伏せる。
  // 本文では「玉島周辺」のように末尾の地区名だけが単独で出てくるため、
  // 住所をまるごと1語として扱うと消し漏れる（実データで検出）。
  for (const field of [src.area, src.localTerms]) {
    const raw = (field ?? '').replace(/\r?\n/g, ' ');
    for (const m of Array.from(raw.matchAll(/([^\s県府都道]{2,6}?[市区町村])/g))) {
      own.push(m[1]);
      own.push(m[1].replace(/[市区町村]$/, ''));
    }
    // 都道府県・市区町村を取り除いた残り（地区名）も1語として伏せる
    for (const chunk of raw.split(/\s+/)) {
      const rest = chunk
        .replace(/^.*?[都道府県]/, '')
        .replace(/^.*?[市区町村]/, '');
      if (rest.length >= 2 && rest.length <= 8) own.push(rest);
    }
  }
  for (const term of own.filter(Boolean).sort((a, b) => b.length - a.length)) {
    if (term.length < 2) continue;
    out = out.split(term).join('◯◯');
  }

  // 2. 連絡先・リンク（店が割れる直接の手がかり）
  out = out.replace(/https?:\/\/\S+/g, '［リンク］');
  out = out.replace(/@[A-Za-z0-9_.]{2,}/g, '＠◯◯');
  out = out.replace(/0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g, '［電話番号］');

  // 3. 番地・建物表記。地名を伏せても「3丁目 911-186 2F」が残ると住所が割れる（実データで検出）
  out = out.replace(/\d+\s*丁目[\s\d\-−ー]*(?:[0-9]+\s*[FfＦ階])?/g, '［住所］');
  out = out.replace(/\d+[-−ー]\d+(?:[-−ー]\d+)?\s*(?:[0-9]+\s*[FfＦ階])?/g, '［住所］');

  // 4. 未登録の固有名の保険。「◯◯駅」「◯◯店」の直前1〜6文字を伏せる
  out = out.replace(/[一-龥ぁ-んァ-ヶA-Za-z0-9]{1,6}駅/g, '◯◯駅');
  out = out.replace(/[一-龥ぁ-んァ-ヶA-Za-z0-9]{2,8}(整体院|整骨院|接骨院|鍼灸院|クリニック|歯科|サロン|スタジオ|店)/g, '◯◯$1');

  // 「新倉敷」の一部だけが伏せられて「新◯◯」が残ると手がかりになる。
  // 伏せ字の直前に付く方角・接頭語の1文字は一緒に飲み込む。
  out = out.replace(/[新北南東西上下中大小旧]+◯◯/g, '◯◯');

  // 伏せ字・住所表記が連続したら1つにまとめる
  out = out.replace(/(◯◯)+/g, '◯◯');
  out = out.replace(/(［住所］)+/g, '［住所］');
  return out.trim();
}

/**
 * 見せる冒頭を選ぶ。
 *
 * 単純に1行目を取ると「おはようございます☀」のような挨拶だけになり、
 * 実例として何も伝わらない。中身のある行（十分な長さの最初の行）を探す。
 */
export function leadLine(full: string): string {
  const lines = full.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const meaningful = lines.find((l) => l.length >= 12) ?? lines[0] ?? '';
  return meaningful.length > EXCERPT_CHARS ? meaningful.slice(0, EXCERPT_CHARS) : meaningful;
}

/** 掲載してよい投稿か */
export function isEligible(src: ShowcaseSource): boolean {
  if (src.showcaseOptOut) return false;              // 本人が掲載を拒否している
  // 短すぎる投稿は載せない。冒頭だけ見せて続きを伏せる構成が成り立たず、
  // 全文がそのまま公開されてしまうため。
  if (!src.postContent || src.postContent.trim().length < MIN_CHARS) return false;
  if (src.impressions < MIN_IMPRESSIONS) return false;
  // 表示だけされて誰も反応しなかった投稿は「反応が取れた例」ではない
  if (src.likes + src.replies < MIN_REACTIONS) return false;
  return true;
}

/** 掲載用に整形。件数を絞り、閲覧数の多い順に並べる */
export function buildShowcase(sources: ShowcaseSource[]): ShowcaseItem[] {
  // postAnalytics には同じ投稿の行が複数入ることがあるため、本文で重複を落とす
  const seen = new Set<string>();
  const unique = sources.filter((s) => {
    const key = (s.postContent ?? '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const perOwner = new Map<string, number>();
  return unique
    .filter(isEligible)
    .sort((a, b) => b.impressions - a.impressions)
    .filter((s) => {
      const key = String(s.ownerKey ?? '');
      if (!key) return true;
      const n = perOwner.get(key) ?? 0;
      if (n >= MAX_PER_OWNER) return false;
      perOwner.set(key, n + 1);
      return true;
    })
    .slice(0, MAX_ITEMS)
    .map((s) => {
      const pref = prefectureOf(s.area);
      const biz = generalizeBusiness(s.businessType);
      const full = redact(s.postContent!, s);
      // 1行目（＝読ませる力のある冒頭）だけを見せ、残りは伏せる。
      // 切り出しはサーバ側で行い、続きは応答に含めない。
      // 画面側でぼかすだけでは、通信を覗けば全文が読めてしまうため。
      const cut = leadLine(full);
      const rest = full.slice(full.indexOf(cut) + cut.length);
      return {
        excerpt: cut.trim() + (rest.trim().length > 0 ? '…' : ''),
        hiddenChars: rest.replace(/\s/g, '').length,
        hiddenLines: Math.min(4, Math.max(2, rest.split(/\r?\n/).filter((l) => l.trim()).length)),
        impressions: s.impressions,
        likes: s.likes,
        replies: s.replies,
        label: pref ? `${biz}・${pref}` : biz,
        postedAt: s.postedAt ? s.postedAt.toISOString().slice(0, 7) : null,
      };
    });
}

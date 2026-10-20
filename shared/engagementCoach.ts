/**
 * 毎日5分の「交流」の案内（2026-10-20 三上様「早急に今から進めて」）。
 *   Threadsは、フォロー・いいね・コメント・「興味なし」の傾向で「何のアカウントか」を判断し、
 *   同じ話題の人のおすすめ欄に載せる。これはAPIではできず、自動でやると規約違反・停止の引き金になる
 *   （server/commentReply.ts の冒頭と同じ理由）。なので、お客様が自分の手で押す作業を、
 *   公式LINEで毎朝1つだけ・5分で終わる量でお知らせする。
 *   出典：Threads集客講座（第02回 初期のジャンル設定／第04回 交流のルーティンとNG4つ）。
 *
 * 決めごと
 *  - 1日1つだけ。日替わり（ROTATION を順番に）
 *  - 「やった」で記録。3日続けて押されなければ、3日に1回に減らす（うるさくしない）。「いらない」で止まる
 *  - 試しは運営のアカウント（学習用）から。広げる範囲は ENGAGEMENT_COACH.mode で切り替える
 *  - 検索のURLは Threads の検索画面（店の地域名＋悩み）。URLを投稿に入れるわけではない
 */
export const ENGAGEMENT_COACH = {
  /** trial＝trialUserIds だけ／new＝連携から newDays 日以内の会員＋trialUserIds */
  mode: "trial" as "trial" | "new",
  trialUserIds: [78] as readonly number[],
  newDays: 30,
  /** 3日続けて「やった」が無ければ、この日数おきに減らす */
  quietEveryDays: 3,
  missLimit: 3,
} as const;

export interface CoachStep {
  key: string;
  title: string;
  /** {area}{worry}{biz} を差し込む */
  body: string;
  /** 1タップで開く画面（無ければ出さない） */
  link?: "search" | "home";
}

export const ROTATION: readonly CoachStep[] = [
  {
    key: "follow",
    title: "同じ地域・同じ業種のアカウントを3つフォロー",
    body: "下の「Threadsで探す」から、{area}の{biz}や、近い仕事の方を3つだけフォローしてください。\nThreadsが「この人は{biz}の人」と覚えて、同じ話題の人のおすすめに出しやすくなります。",
    link: "search",
  },
  {
    key: "not_interested",
    title: "関係ない投稿に「興味なし」を3つ",
    body: "Threadsのおすすめ欄を開いて、お店と関係ない投稿を3つ選び、右上の「…」から「興味なし」を押してください。\nおすすめ欄が{biz}の話題に寄るほど、あなたの投稿も同じ話題の人に届きやすくなります。",
    link: "home",
  },
  {
    key: "comment",
    title: "「{area} {worry}」で検索して、1つだけ共感のコメント",
    body: "下の「Threadsで探す」で出てきた投稿の中から1つ選び、「わかります、〇〇ですよね」のような共感の一言を書いてください。\n宣伝・URL・同じ文の使い回しは逆効果です。1つで十分です。",
    link: "search",
  },
  {
    key: "like",
    title: "同業の投稿に、いいねを10個まで",
    body: "フォローした方の投稿や、{biz}の投稿に、いいねを10個まで押してください。\n短い時間に何十個も続けて押すと止められることがあるので、ゆっくりで大丈夫です。",
    link: "home",
  },
  {
    key: "reply_back",
    title: "自分の投稿へのコメントに返す",
    body: "自分の投稿にコメントが付いていたら、今日のうちに返してください（このLINEに文案つきで届いています）。\n会話が続く投稿ほど、Threadsは多くの人に出します。コメントが無い日は「やった」で大丈夫です。",
  },
];

/** 守ること（毎回の案内の最後に1行） */
export const COACH_NG = "やらないこと：短時間のいいね連打・知らない人への大量フォロー・同じコメントの使い回し・宣伝のコメント";

/** 連携からの日数で何番目の案内か（毎日1つずつ進む） */
export function stepForDay(dayIndex: number): CoachStep {
  const n = ROTATION.length;
  return ROTATION[((dayIndex % n) + n) % n]!;
}

/** 業種から、検索に使う悩みの言葉（無ければ業種名そのもの） */
export function worryWordFor(businessType: string | null | undefined): string {
  const b = String(businessType ?? "");
  if (/整骨|接骨|整体|カイロ|鍼|灸|治療|リハビリ/.test(b)) return "腰痛";
  if (/ピラティス|ヨガ|ジム|パーソナル|トレーニング/.test(b)) return "姿勢";
  if (/美容室|ヘア|サロン|理容/.test(b)) return "髪";
  if (/エステ|脱毛|まつ|ネイル/.test(b)) return "肌";
  if (/産後|骨盤/.test(b)) return "産後";
  if (/カフェ|飲食|パン|ベーカリー|レストラン|居酒屋/.test(b)) return "ランチ";
  return b.replace(/[（(].*$/, "").slice(0, 10) || "おすすめ";
}

const BIZ_NOUNS = /(整骨院|接骨院|整体院|鍼灸院|鍼灸|治療院|カイロプラクティック|整体|ピラティス|ヨガ|パーソナルジム|ジム|美容室|ヘアサロン|理容室|エステ|ネイルサロン|ネイル|まつげ|脱毛|カフェ|ベーカリー|パン屋|歯科|クリニック|サロン)/;

/** 業種の欄（自由記入で長いことがある）から、検索・案内に使う短い業種名 */
export function bizWordFor(businessType: string | null | undefined): string {
  const b = String(businessType ?? "");
  const m = b.match(BIZ_NOUNS);
  if (m) return m[1]!;
  const head = b.replace(/[（(].*$/, "").split(/[・／/、,。\s]/)[0]!.trim();
  return head && Array.from(head).length <= 8 ? head : "同業";
}

/** 地域の欄（番地まで入っていることがある）から市区町村だけ。「岡山県倉敷市玉島1-2」→「倉敷市」 */
export function cityWordFor(area: string | null | undefined): string {
  const raw = String(area ?? "").trim();
  if (/^(なし|無し|未定|特になし|オンライン.*|全国.*|-)$/.test(raw)) return "";
  const rest = raw.replace(/^(東京都|北海道|京都府|大阪府|[^都道府県\s]{2,3}県)/, "").trim();
  const m = rest.match(/^(.{1,6}?[市区])(?![市])/) ?? rest.match(/^(.{1,5}?郡.{1,5}?[町村])/) ?? rest.match(/^(.{1,5}?[町村])/);
  return m ? m[1]! : rest.replace(/[0-9０-９].*$/, "").slice(0, 6);
}

export function fill(text: string, v: { area: string; worry: string; biz: string }): string {
  return text.replace(/\{area\}/g, v.area).replace(/\{worry\}/g, v.worry).replace(/\{biz\}/g, v.biz);
}

export function searchUrl(area: string, worry: string): string {
  const q = [area, worry].filter(Boolean).join(" ");
  return `https://www.threads.com/search?q=${encodeURIComponent(q)}&openExternalBrowser=1`;
}

/**
 * 今日送るか。
 *  - 止めている（enabled=false）なら送らない
 *  - 今日もう送ったなら送らない
 *  - 「やった」が missLimit 回続けて無ければ、quietEveryDays 日おきだけ
 */
export function shouldSendToday(s: { enabled: boolean; lastSentYmd: string | null; missStreak: number }, todayYmd: string): boolean {
  if (!s.enabled) return false;
  if (s.lastSentYmd === todayYmd) return false;
  if (s.missStreak >= ENGAGEMENT_COACH.missLimit && s.lastSentYmd) {
    const days = Math.round((Date.parse(`${todayYmd}T00:00:00Z`) - Date.parse(`${s.lastSentYmd}T00:00:00Z`)) / 86_400_000);
    return days >= ENGAGEMENT_COACH.quietEveryDays;
  }
  return true;
}

/** 対象の会員か（mode に従う） */
export function isCoachTarget(userId: number, firstConnectedAt: Date | null, now: number = Date.now()): boolean {
  if (ENGAGEMENT_COACH.trialUserIds.includes(userId)) return true;
  if (ENGAGEMENT_COACH.mode !== "new" || !firstConnectedAt) return false;
  return now - firstConnectedAt.getTime() <= ENGAGEMENT_COACH.newDays * 86_400_000;
}

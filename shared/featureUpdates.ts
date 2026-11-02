/**
 * 「できるようになったこと」のお知らせ（週1回）（2026-11-02 三上様「アップデートされるたびに配信されるように。1週間に1回」）。
 *
 * > 「できるようになったこと」を知らないまま契約しているお客様が多い。
 * > アップデートのたびに「このようなことができるようになりました」を配信したい。毎日は鬱陶しいので週1回。
 *
 * 判断と文面だけを置く（DB・LINEは server/featureUpdates.ts）。
 *
 * ★台帳の決まり（docs/feature-updates.md）
 *   お客様に見える機能を本番に入れ、本番で実際に動いたことを確かめたら、ここに1件足す。
 *   verifiedAt（確かめた日）と verifiedHow（何で確かめたか）が無い項目は、配信しない。
 *   2026-11-02 の教訓：写真つき自動投稿は 10/28 に mode=on にしたが、本番では一度も動いていなかった。
 *   「作った」「入れた」ではなく「本番で動いた」を確かめてから載せる。
 * ★お客様へは自動で送らない。毎週、三上様のLINEへ下見を送り、「この内容で送る」を押した週だけ届く。
 * ★社外に出る文なので、絵文字・講師名・書名・広告費の額を書かない。「AIが」と書かず「自動で」と書く。
 * ★このリポジトリは公開。verifiedHow にお客様の名前・アカウント名を書かない（件数だけ）。
 */
import { isProOrAbove } from "./mediaPosts";

/** 受け取る方の状況（当てはまる項目だけを出すために使う） */
export interface FeatureUpdateContext {
  /** いまのプラン（resolveEffectivePlanId を通した後） */
  planId: string;
  /** 1日の自動投稿の上限（0＝自動投稿の無いプラン） */
  maxPerDay: number;
  /** 公開前の確認をしている */
  requireApproval: boolean;
  /** 公式LINEがつながっている（LINEで使う機能は、LINEの無い方には出さない） */
  hasLine: boolean;
}

export interface FeatureUpdate {
  /** 英数字の識別子（配信記録のキー。あとから変えない） */
  id: string;
  /** 本番に入った日（YYYY-MM-DD・JST） */
  date: string;
  /** お客様向けの短い見出し */
  title: string;
  /** 何ができるか・どう使うか（LINEのどのボタン／何を送るか）。2〜4行 */
  body: string;
  /** 当てはまる方だけに出す（省略時は全員） */
  when?: (ctx: FeatureUpdateContext) => boolean;
  /** 本番で実際に動いたことを確かめた日（YYYY-MM-DD）。★これが無い項目は配信しない */
  verifiedAt?: string;
  /** 何で確かめたか（社内メモ・お客様には出さない）。確かめられていない理由もここに書く */
  verifiedHow?: string;
}

const lineOnly = (c: FeatureUpdateContext) => c.hasLine;

/**
 * 台帳。新しいものを下に足す。
 * 初回（2026-11-04 の下見）は「これまでにできるようになったこと」のまとめ。
 */
export const FEATURE_UPDATES: readonly FeatureUpdate[] = [
  {
    id: "pinned_from_line",
    date: "2026-09-02",
    title: "プロフィールの固定投稿を、このトークで作って公開できます",
    body:
      "メニューの「固定投稿を作る」を押すと、ご登録のお店の情報から、プロフィールの一番上に置く固定投稿の文を作ります。\n" +
      "内容を見て「これで投稿する」を押すと公開されます。公開のあと、プロフィールへのピン留めのやり方もこのトークでご案内します。",
    when: lineOnly,
    verifiedAt: "2026-11-02",
    verifiedHow: "本番DB：angle='pinned' の公開 28件（運営以外 12名・25件、うち LINE の承認 approvedVia='line_one' 9件、最新 10/4）",
  },
  {
    id: "review_hour",
    date: "2026-09-24",
    title: "投稿の案が届く時間を選べます",
    body:
      "「設定」→「案を見る時間を選ぶ」で、朝7時・昼12時・夕方6時・夜9時から、ご確認しやすい時間を選べます。\n" +
      "夕方・夜を選ぶと、翌日の分の案を前の日のその時間にお届けします。ご確認の前に公開の時間が来ることはありません。",
    when: (c) => c.hasLine && c.maxPerDay > 0 && c.requireApproval,
    verifiedAt: "2026-11-02",
    verifiedHow: "本番DB：users.reviewHour を選んだ方 5名。夕方以降を選んだ方の「前の日に作った翌日分」の自動投稿が公開 85件（最新 11/2）",
  },
  {
    id: "owner_rules",
    date: "2026-10-19",
    title: "「うちはこう書く」という決まりを、ご自身で足せます",
    body:
      "このトークに「決まり：自分のことは『私』と書く」のように送ると、次に作る投稿から、いちばん優先して守ります。1つ80字まで、10個まで入れられます。\n" +
      "入れた決まりの確認と取り消しは、「設定」→「書き方の決まり」からできます。",
    when: (c) => c.hasLine && c.maxPerDay > 0,
    verifiedHow:
      "未確認（11/2）：決まりが入っているのは3アカウント。1アカウントは決まりどおりの投稿が続いているが、別の1アカウントで決まりに当たりそうな投稿が 11/1 にあり、" +
      "決まりを入れた日時の記録が無いため、守られているかを判定できない",
  },
  {
    id: "line_post_request",
    date: "2026-11-02",
    title: "公式LINEに送った文章を、指定の日時に投稿できます",
    body:
      "このトークに「3日の18時頃 この投稿をお願いします」のように日時を書き、続けて投稿にしたい文章を送ってください。文章は変えずに、その日時に予約します（「配信お願いします」「予約お願いします」でも大丈夫です）。\n" +
      "日時を書かずに文章だけ送ったときは、「いちばん早い日に出す」「日にちを選ぶ」から選べます。予約のあとに届くお返事の「取り消す」で取り消せます。",
    when: (c) => c.hasLine && c.maxPerDay > 0,
    verifiedHow:
      "未確認（11/2 13時）：approvedVia='line_post' の予約は8件入った（11/2〜11/8）が、公開はまだ0件。最初の公開予定は 11/2 18:00 JST。" +
      "公開を本番DB（status='posted' かつ publishedThreadsPostId あり）で確かめたら verifiedAt を入れる",
  },
  {
    id: "material_topic",
    date: "2026-10-13",
    title: "書いてほしい話題を、このトークから登録できます",
    body:
      "季節のメニューやよく聞かれることなど、書いてほしい話題をこのトークに送り、「話題として登録」を押してください。\n" +
      "その話題を主役にした投稿を作ります。同じ話題は3週間ほどあけて使います。",
    when: (c) => c.hasLine && c.maxPerDay > 0,
    verifiedHow: "未確認（11/2）：本番の materialItems が0件・ネタを使った公開0件。一度も使われていない",
  },
  {
    id: "event_announce",
    date: "2026-08-31",
    title: "イベントの告知を、開催日に合わせて自動で予約できます",
    body:
      "管理画面の「イベント告知」に、イベント名・開催日・場所・参加方法を登録すると、2週間前・1週間前・3日前・前日・当日の告知の投稿を自動で作って予約します。\n" +
      "中止になったときは、まだ出ていない告知をまとめて取り消せます。",
    when: (c) => c.maxPerDay > 0,
    verifiedHow: "未確認（11/2）：運営以外の方の、イベント告知の公開が0件",
  },
  {
    id: "media_posts",
    date: "2026-10-28",
    title: "お店の写真を付けた投稿を、自動で出せます（プロプラン以上）",
    body:
      "このトークにお店や商品の写真を送っていただくと、お預かりして、1日1本、写真に合った短い文を付けて自動で投稿します。\n" +
      "同じ写真は2週間ほどあけて使います。写真を送らなければ、これまでどおりの投稿のままです。",
    when: (c) => c.hasLine && c.maxPerDay > 0 && isProOrAbove(c.planId),
    verifiedHow: "未確認（11/2）：mode=on にしたが、本番で写真つきの公開0件（mediaItems に預かりはあるが、使われた記録なし）",
  },
];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** 本番で動いたことを確かめた項目か（verifiedAt が日付の形で入っている） */
export function isVerified(u: FeatureUpdate): boolean {
  return typeof u.verifiedAt === "string" && ISO_DAY.test(u.verifiedAt);
}

/**
 * 今週のお知らせの候補：確かめずみで、まだ送っていない（送らないと決めてもいない）項目。
 * @param closed 送信ずみ・「出さない」と決めた項目の id
 */
export function pendingUpdates(closed: ReadonlySet<string>, list: readonly FeatureUpdate[] = FEATURE_UPDATES): FeatureUpdate[] {
  return list.filter((u) => isVerified(u) && !closed.has(u.id));
}

/** その方に送る項目：当てはまる項目のうち、その方にまだ届いていないもの */
export function updatesFor(items: readonly FeatureUpdate[], ctx: FeatureUpdateContext, delivered: ReadonlySet<string> = new Set()): FeatureUpdate[] {
  return items.filter((u) => isVerified(u) && !delivered.has(u.id) && (!u.when || u.when(ctx)));
}

/**
 * お客様に届く文。項目が0件なら null（空のお知らせは送らない）。
 * channel=email のときは、最後の一言をメール向けにする（返信先は会社の窓口）。
 */
export function renderFeatureUpdates(items: readonly FeatureUpdate[], channel: "line" | "email" = "line"): string | null {
  if (items.length === 0) return null;
  const list = items.map((u, i) => `${i + 1}. ${u.title}\n${u.body}`).join("\n\n");
  const closing = channel === "line"
    ? "分からないことがあれば、このトークにそのまま送ってください。"
    : "分からないことがあれば、このメールにそのままご返信ください。";
  return (
    "【できるようになったこと】\n\n" +
    "いつもThreads Studioをご利用いただきありがとうございます。\n" +
    "最近のアップデートで、次のことができるようになりました。今お使いの設定や、投稿の中身は何も変わりませんので、ご安心ください。\n" +
    "使ってみたいものがあれば、お手すきのときにお試しください。\n\n" +
    `${list}\n\n${closing}`
  );
}

/** 下見で「どの方にどう見えるか」を言うためのラベル */
export function contextLabel(c: FeatureUpdateContext): string {
  const plan = c.maxPerDay <= 0 ? "自動投稿なしのプラン" : isProOrAbove(c.planId) ? "プロ以上" : "ライトなど";
  const parts = [plan];
  if (c.maxPerDay > 0) parts.push(c.requireApproval ? "公開前の確認あり" : "確認なし");
  parts.push(c.hasLine ? "LINE" : "メール");
  return parts.join("・");
}

export interface PreviewVariant { label: string; count: number; text: string }

/**
 * 三上様への下見の文（1通目）。各見え方の全文は別の吹き出しで送る（server 側）。
 */
export function adminPreviewHead(items: readonly FeatureUpdate[], recipients: number, variants: readonly PreviewVariant[], nothingFor: number): string {
  const lines = items.map((u, i) => `${i + 1}. ${u.title}（確認 ${u.verifiedAt}）`).join("\n");
  return (
    "【今週の『できるようになったこと』・お送りする前の確認】\n" +
    `今週お知らせする項目（${items.length}件・本番で動いたことを確かめたものだけ）：\n${lines}\n\n` +
    `配信先：ご契約中の有料会員 ${recipients}名（読み物と同じ方。「不要」とおっしゃった方・無料・解約ずみの方には送りません）\n` +
    `お一人ずつ、プランや設定に当てはまる項目だけを送ります。届く文は${variants.length}通りです（このあとの吹き出し）。` +
    (nothingFor > 0 ? `\n当てはまる項目が無い ${nothingFor}名には送りません。` : "") +
    "\n\n「この内容で送る」を押した時点で配信先を数え直してから送ります。押さなければ誰にも届かず、来週の下見にもう一度入ります。"
  );
}

/** 絵文字が入っていないか（文面の検査用） */
export function hasPictograph(s: string): boolean {
  // （tsc の target が es5 のため、u フラグは RegExp の作り方で渡す）
  return new RegExp("\\p{Extended_Pictographic}", "u").test(s);
}

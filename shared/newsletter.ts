/**
 * 有料会員向けの読み物（週1回・公式LINE／LINEが無い方はメール）（2026-09-29 三上様指示）。
 *
 * > 「いろいろなパターンを試していって、伸びる方を見つけていくのが鉄則」ということが分かるような、メルマガ形式での配信
 * > 「全員で。有料会員のみに配信をして、解約した人には配信しない仕組みを最初から入れておいて。無料プランは配信なし」
 *
 * 判断と文面だけを置く（DB・LINEは server/newsletter.ts）。
 * ★お客様へは自動で送らない。毎週、三上様のLINEへ下見を送り、「送る」を押した回だけ届く。
 * ★社外に出る文なので、講師名・書名・絵文字・広告費の具体額は書かない。
 */

/**
 * 配信してよい方か。有料で、いまご契約中の方。
 * 解約の予約が入っていても、ご契約期間が残っているあいだは有料会員として送る
 * （2026-09-29 三上様「解約の予約があって、まだ有料会員の人にはちゃんと送ってください」）。
 */
export interface RecipientSub {
  planId: string | null;
  status: string | null;
  univapaySubscriptionId: string | null;
  cancelAtPeriodEnd: boolean | number | null;
  /** ご契約期間の終わり。解約予約の方は、ここを過ぎたら送らない */
  currentPeriodEnd?: Date | string | null;
}

export function isPaidMemberSubscription(s: RecipientSub, now: Date = new Date()): boolean {
  if (!s) return false;
  const plan = String(s.planId ?? "");
  if (!plan || plan === "free" || plan.startsWith("free")) return false; // 無料プラン
  if (s.status !== "active") return false; // 解約ずみ・未払い・お試し
  if (!s.univapaySubscriptionId) return false; // 課金なしのお試し・運営のテスト
  // 解約の予約あり：期間が残っていれば送る。期間の終わりを過ぎたのに status が active のままなら送らない
  if ((s.cancelAtPeriodEnd === true || Number(s.cancelAtPeriodEnd) === 1) && s.currentPeriodEnd) {
    const end = new Date(s.currentPeriodEnd);
    if (!Number.isNaN(end.getTime()) && end.getTime() <= now.getTime()) return false;
  }
  return true;
}

/** ご契約が複数あっても、1つでも条件を満たせば配信する。運営（admin）には送らない */
export function isNewsletterRecipient(user: { role?: string | null }, subs: RecipientSub[]): boolean {
  if (user?.role === "admin") return false;
  return (subs ?? []).some((s) => isPaidMemberSubscription(s));
}

export interface NewsletterIssue {
  no: number;
  title: string;
  /** 本文。{PERSONAL} はお一人ずつの数字に置き換える（第5回） */
  body: string;
  /** 本文の下に付けるボタン（LINEのみ） */
  buttons?: Array<{ label: string; data: string }>;
}

export const NEWSLETTER_ISSUES: readonly NewsletterIssue[] = [
  {
    no: 1,
    title: "1本の出来より、出した本数",
    body:
      "Threadsの投稿を大規模に調べた実測（114アカウント・約13万投稿）では、1本の投稿が大きく伸びる確率は、" +
      "伸びている人もそうでない人も、ほぼ同じでした（17.7%と17.9%）。\n" +
      "差がついていたのは、出した本数です。伸びている人は、約15倍の本数を出していました。\n\n" +
      "Threads Studioをお使いのお店どうしを比べても、1本あたりの見られ方は大きく変わらず、" +
      "1日あたりの見られ方の差は、出した本数の差でした。\n\n" +
      "どの投稿が伸びるかは、出してみるまで誰にも分かりません。\n" +
      "だからこそ、いろいろな書き方を出してみて、伸びた方を見つけていくのが鉄則です。\n\n" +
      "次回は、「見送る」と「そのまま出す」の使い分けをお送りします。",
  },
  {
    no: 2,
    title: "迷ったら、出して数字で決める",
    body:
      "届いた投稿を「なんとなく自分らしくない」と見送ると、その日に試せる書き方が1つ減ります。\n\n" +
      "見送っていただきたいのは、次のようなときです。\n" +
      "・事実と違うことが書いてある\n" +
      "・お店でしていないメニューやサービスが書いてある\n" +
      "・お客様に誤解を与えそうな言い方がある\n\n" +
      "それ以外で迷ったときは、そのまま出して、数字で判断するのがおすすめです。" +
      "自分では「いまひとつ」と思った投稿が、いちばん読まれることもあります。\n\n" +
      "直したい所がはっきりしているときは「書き直す」、使ってほしくない言葉は「NGワード」に登録すると、次からの投稿にも反映されます。\n\n" +
      "次回は、伸びた投稿の見分け方をお送りします。",
  },
  {
    no: 3,
    title: "伸びた投稿の見分け方",
    body:
      "伸びたかどうかは、ほかのお店とではなく、ご自身のお店の「いつもの数字」と比べて判断します。目安は次のとおりです。\n" +
      "・表示回数が、いつもの2倍以上\n" +
      "・コメントがついた\n" +
      "・フォローが増えた、LINEの登録やご予約につながった\n\n" +
      "1本ずつ一喜一憂する必要はありません。週に1〜3本、この目安に当たる投稿が見つかれば十分です。\n\n" +
      "直近7日の成績は、下の「投稿の成績」から確認できます。\n\n" +
      "次回は、伸びた書き方の続け方をお送りします。",
    buttons: [{ label: "投稿の成績", data: "m=stats" }],
  },
  {
    no: 4,
    title: "伸びた書き方は、題材を変えてくり返す",
    body:
      "伸びた投稿が見つかったら、その「書き方」を、題材を変えてくり返すのが近道です。\n" +
      "たとえば「よくある勘違い」を正す書き方が伸びたら、別の勘違いを題材にして、同じ書き方でもう一度出してみます。\n\n" +
      "同じ書き方が続くと、書いている側は飽きてきますが、読む側はそれほど気にしていません。\n" +
      "ただ、まったく同じ言い回しが続くと読まれにくくなるため、Threads Studioでは言い回しと題材を入れ替えながら作っています。\n\n" +
      "次回は、あなたのお店で伸びた書き方を、実際の数字でお送りします。",
  },
  {
    no: 5,
    title: "あなたのお店で伸びた書き方",
    body:
      "{PERSONAL}\n\n" +
      "これまでの4回のまとめです。\n" +
      "1. 1本の出来より、出した本数\n" +
      "2. 迷ったら、出して数字で決める\n" +
      "3. 伸びたかどうかは、いつもの2倍が目安\n" +
      "4. 伸びた書き方は、題材を変えてくり返す\n\n" +
      "これからも、いろいろな書き方を試しながら、お店に合う書き方を中心にお作りしていきます。",
  },
];

/** 第5回の「あなたのお店の数字」。比べられるだけの本数が無ければ、そう正直に書く */
export function personalNote(p: { storeName?: string | null; bestLabel?: string | null; bestAvg?: number; overallAvg?: number; total: number }): string {
  const who = String(p.storeName ?? "").trim();
  const ratio = p.bestAvg && p.overallAvg ? p.bestAvg / p.overallAvg : 0;
  if (p.total < 10 || !p.bestLabel || ratio < 1.2) {
    return `${who ? `${who}様の` : ""}アカウントは、まだ書き方どうしを比べられるだけの本数がたまっていません（目安：30日で10本以上）。\n` +
      "出し続けるほど、お店に合う書き方がはっきりしてきます。";
  }
  return `${who ? `${who}様の` : ""}アカウントの直近30日で、いちばん見られていたのは「${p.bestLabel}」の書き方でした。\n` +
    `1本あたり平均${Math.round(p.bestAvg!)}回見られていて、全体の平均の${ratio.toFixed(1)}倍です。`;
}

/** 1回分の本文（見出しつき） */
export function renderIssue(issue: NewsletterIssue, personal = ""): string {
  return `【Threadsを伸ばすコツ 第${issue.no}回】${issue.title}\n\n${issue.body.replace("{PERSONAL}", personal)}`;
}

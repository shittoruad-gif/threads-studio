/**
 * LINEトーク内で完結する操作（チャット形式）。
 *
 * 2026-09-01 三上さん指示: 「アプリに繋ぐのではなく、LINEの文章のやり取りで完結させたい」。
 * リッチメニュー・通知のボタンはすべて postback にして、Webビュー（LIFF）を開かずに
 * トーク内の返信だけで承認・書き直し・設定変更まで終わるようにする。
 *
 * 設計:
 *   - すべて reply API で返す（通数を消費しない）。
 *   - 複数ステップが必要なもの（書き直しの指示・NGワードの単語）は
 *     lineChatStates に「次のテキストの意味」を1行だけ保存して受け取る。
 *   - 返信は原則1通。選択肢はクイックリプライ、投稿はFlexカードで見せる。
 */
import * as db from "./db";

// ── 返信メッセージの組み立て ───────────────────────────────────
type QuickItem = { label: string; data: string };

/** クイックリプライ付きテキスト（選択肢は最大13件） */
export function textWithQuick(text: string, items: QuickItem[]): unknown {
  const msg: any = { type: "text", text };
  // ★同じラベルが二重に並ぶと押し間違いのもとになるので、先に出た方だけを残す。
  //   （「次にやること」を先頭に足したときに、共通メニュー側と重複していた）
  const seen = new Set<string>();
  items = items.filter((it) => {
    const key = it.label.slice(0, 20);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (items.length > 0) {
    msg.quickReply = {
      items: items.slice(0, 13).map((it) => ({
        type: "action",
        action: { type: "postback", label: it.label.slice(0, 20), data: it.data, displayText: it.label.slice(0, 20) },
      })),
    };
  }
  return msg;
}

/**
 * 選択肢タップで「その文字を発言する」クイックリプライ。
 * カウンセリングの回答のように、タップでも手入力でも同じ扱いにしたいときに使う。
 */
export function textWithChoices(text: string, choices: string[]): unknown {
  const msg: any = { type: "text", text };
  if (choices.length > 0) {
    msg.quickReply = {
      items: choices.slice(0, 13).map((c) => ({
        type: "action",
        action: { type: "message", label: c.slice(0, 20), text: c.slice(0, 300) },
      })),
    };
  }
  return msg;
}

export function fmtJst(v: Date | string | null): string {
  if (!v) return "";
  const d = new Date(v);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * 承認待ち投稿のカード（トーク内で完結。ボタンはすべてpostback）。
 * 本文は全文を載せる（見に行かせない）。1カード=1投稿・最大5件。
 */
export function buildPostCards(
  posts: Array<{ id: number; postContent: string | null; scheduledAt: Date | string | null; accountName?: string | null }>,
  opts: { one?: boolean; bulk?: boolean } = {},
): unknown {
  const suffix = opts.one ? "&o=1" : "";
  const bubbles = posts.slice(0, 5).map((p) => ({
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        {
          type: "text",
          // ★複数アカウントを運用していても「どのアカウントの投稿か」が必ず分かるようにする
          text: (p.accountName ? `@${p.accountName}　` : "") + `${fmtJst(p.scheduledAt)} 公開予定`,
          size: "xs", color: "#0E8388", weight: "bold", wrap: true,
        },
        { type: "text", text: (p.postContent || "（本文なし）").slice(0, 900), wrap: true, size: "sm", color: "#13343B" },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "button", style: "primary", color: "#0E8388", height: "sm",
          action: { type: "postback", label: "これで投稿する", data: `a=ok&i=${p.id}${suffix}`, displayText: "これで投稿する" } },
        { type: "box", layout: "horizontal", spacing: "sm", contents: [
          { type: "button", style: "secondary", height: "sm",
            action: { type: "postback", label: "書き直す", data: `a=rw&i=${p.id}${suffix}`, displayText: "書き直す" } },
          { type: "button", style: "secondary", height: "sm",
            action: { type: "postback", label: "見送る", data: `a=skip&i=${p.id}${suffix}`, displayText: "見送る" } },
        ] },
      ],
    },
  }));
  const msg: any = {
    type: "flex",
    altText: `承認待ちの投稿が${posts.length}件あります`,
    contents: bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles },
  };
  // ★2件以上まとめて見るときは「すべて承認する」を足す。
  //   1件ずつ「これで投稿する」を押していくのが手間、というご要望（2026-09-03）。
  //   1件だけのときは出さない（個別ボタンと意味が同じで迷うだけ）。
  if (opts.bulk && posts.length > 1) {
    msg.quickReply = {
      items: [
        { type: "action", action: { type: "postback", label: `すべて承認する（${posts.length}件）`, data: "a=okall", displayText: "すべて承認する" } },
        { type: "action", action: { type: "postback", label: "1件ずつ確認する", data: "m=posts&one=1", displayText: "1件ずつ確認する" } },
      ],
    };
  }
  return msg;
}

/** 書き直しの方向（クイックリプライの選択肢） */
export const REWRITE_KINDS: Record<string, { label: string; instruction: string }> = {
  short: { label: "もっと短く", instruction: "もっと短く、50〜80字程度にまとめてください。" },
  soft: { label: "やわらかく", instruction: "もっとやわらかく、親しみのある話し言葉にしてください。" },
  pro: { label: "専門的に", instruction: "専門家としての知見が伝わる、少し硬めの書き方にしてください。" },
  detail: { label: "くわしく", instruction: "もう少しくわしく、具体例を足して書いてください。" },
};

// ── 途中状態（次に届くテキストの意味）─────────────────────────
export type ChatState = "rewrite_free" | "ngword" | "profile_edit";

export function parsePostback(data: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of String(data || "").split("&")) {
    const [k, v] = kv.split("=");
    if (k) out[k] = decodeURIComponent(v ?? "");
  }
  return out;
}

/**
 * 「次に送られる文章」を待っている状態と、その待ち状態を作るボタン。
 *
 * ここに無い状態（counseling＝はじめの設定、link_email/signup_code＝連携の途中）は、
 * ボタン操作も流れの一部なので、別のボタンが押されても消してはいけない。
 */
const PENDING_TEXT_INPUT: Record<string, (q: Record<string, string>) => boolean> = {
  ngword: (q) => q.s === "ng",
  set_line_url: (q) => q.c === "seturl",
  self_edit: (q) => q.a === "selfedit",
  rewrite_free: (q) => q.a === "rw",
  staff_message: (q) => q.m === "staff",
};

/**
 * 文章の入力待ちの途中で押されたボタンによって、その待ち状態をやめるべきか。
 *
 * ★これが無いと、お客様が「NGワードを追加」を押したあと気が変わってメニューへ
 *   移られても待ち状態が残り、次に打たれた文章が使わない言葉として登録されてしまう
 *   （ご質問がそのままNGワードになり、以後の投稿がその言い回しを避ける）。
 *   公式LINEのURL待ちでも同じで、何を打っても「URLの形になっていない」と返り、
 *   「やめる」と打つまで抜け出せなかった。
 *
 * 同じ待ち状態をもう一度作るボタン（NGワード待ちで「NGワードを追加」など）は、
 * そのボタン自身が状態を作り直すので、ここでは消さない。
 */
export function shouldClearPendingInput(state: string | null | undefined, q: Record<string, string>): boolean {
  const setter = state ? PENDING_TEXT_INPUT[state] : undefined;
  return Boolean(setter) && !setter!(q);
}

// ── 画面を開かせずに返す各種テキスト ──────────────────────────
export const MENU_ITEMS: QuickItem[] = [
  { label: "今日の投稿", data: "m=posts" },
  { label: "コメント", data: "m=comments" },
  { label: "設定", data: "m=settings" },
  { label: "投稿の成績", data: "m=stats" },
  { label: "固定投稿を作る", data: "m=makepin" },
  { label: "お店の情報", data: "m=profile" },
  // ★リッチメニュー（6枠）から「使い方」を外したので、
  //   どの返信からも1タップで開けるよう、ここには必ず残す。
  { label: "使い方", data: "m=help" },
  { label: "はじめの設定", data: "m=setup" },
  { label: "アカウント連携", data: "m=connect" },
];

/**
 * よくあるご質問。
 *
 * ★ action は「その場で実行できるボタン」。
 *   手順を説明して終わりにすると、読んだあとに同じ操作をもう一度たどらせることになり、
 *   意味のない往復になる。実行できるものは必ずボタンを添える。
 */
export const HELP_TOPICS: Array<{ key: string; q: string; a: string; action?: QuickItem; directPostback?: string }> = [
  { key: "flow", q: "毎日の流れは？",
    a: "毎日AIが投稿を作ります。承認モードがONなら、このトークに「今日の投稿」が届くので、内容を見て「これで投稿する」を押すだけです。書き直したいときは「書き直す」を押して、どう直すかを選ぶか、直接ご希望を送ってください。",
    action: { label: "今日の投稿を見る", data: "m=posts" } },
  { key: "auto", q: "確認なしで全部おまかせにしたい",
    a: "公開前の確認をOFFにすると、確認なしで毎日自動で公開されます。あとから戻すこともできます。\n下のボタンで、いますぐ切り替えられます。",
    action: { label: "確認なしにする", data: "s=appr&v=off" } },
  { key: "ng", q: "使ってほしくない言葉がある",
    a: "使ってほしくない言葉を登録すると、以後の投稿では自動的に避けます。\n下のボタンを押して、そのまま言葉をお送りください。",
    action: { label: "NGワードを追加", data: "s=ng" } },
  // ★選んだ時点で意図がはっきりしているので、説明を挟まずその場でコードを出す
  //   （コードは10分で失効し、出し直しても害がないため）
  { key: "member", q: "スタッフも操作できるようにしたい", a: "", directPostback: "m=addstaff" },
  { key: "members", q: "何人まで操作できますか？",
    a: "このトークから操作できる人数は、ご契約のプランで決まります。\n" +
      "・フリー／ライト（セミナー価格も同じ）：1人\n" +
      "・プロ（セミナー価格・モニター価格も同じ）：3人\n" +
      "・ビジネス：人数の制限なし\n\n" +
      "追加した方も、投稿の確認・承認・設定変更ができます（オーナーと同じ操作です）。\n" +
      "下のボタンを押すと、追加用の6桁のコードをお出しします。",
    action: { label: "スタッフを追加", data: "m=addstaff" } },
  { key: "multi", q: "2つ目のアカウントをつなぎたい",
    a: "つなげるThreadsアカウントの数は、ご契約のプランで決まります。\n" +
      "・フリー／ライト：1つ\n" +
      "・プロ（セミナー価格・モニター価格も同じ）：3つ\n" +
      "・ビジネス：10まで\n\n" +
      "2つ以上つないだ場合は、このトークの操作でも毎回「どのアカウントか」をお選びいただく形になります。\n" +
      "投稿の設定（自動投稿・公開前の確認・1日の回数・投稿の長さ）も、アカウントごとに変えられます。\n\n" +
      "下のボタンで、いま何件つないでいるか・あと何件つなげるかと、連携ページのリンクをお送りします。\n" +
      "連携だけはMeta（Threads）の認証画面を通るため、LINEの中ではなく通常のブラウザで開いてください。",
    action: { label: "アカウント連携", data: "m=connect" } },
  // ★複数アカウント運用のとき、設定がアカウントごとに分かれていることを知らないと
  //   「片方だけ止めたい」ができると気づかれない（2026-09-03 追加）
  { key: "acctsettings", q: "アカウントごとに設定を変えたい",
    a: "2つ以上のアカウントをつないでいる場合、投稿の設定はアカウントごとに変えられます。\n" +
      "・自動投稿のON／OFF\n" +
      "・公開前の確認をする／しない\n" +
      "・1日の投稿回数（アプリの設定画面から）\n" +
      "・投稿の長さ（短め／長め／交互）\n\n" +
      "「片方のアカウントだけ止める」「片方だけ確認あり」といった使い分けができます。\n" +
      "下の「設定」を押すと、アカウントごとの今の状態が一覧で出ます。そこから変えたいアカウントを選んでください。\n" +
      "※ 1つだけつないでいる場合は、これまでどおりの設定画面が出ます。",
    action: { label: "設定", data: "m=settings" } },
  { key: "makepin", q: "固定投稿を作りたい", a: "", directPostback: "m=makepin" },
  { key: "pin", q: "固定投稿のピン留めのやり方",
    a: "", directPostback: "n=pinhow" },
  { key: "stop", q: "しばらく投稿を止めたい",
    a: "自動投稿をOFFにすると止まります。再開したいときは同じ場所でONにしてください。\n下のボタンで、いますぐ止められます。",
    action: { label: "自動投稿を止める", data: "s=auto&v=off" } },
];

/** ヘルプの選択肢 */
export function helpQuick(): QuickItem[] {
  // ★どのご質問にも当てはまらないときのために、最後に必ず担当者への導線を置く。
  return [
    ...HELP_TOPICS.map((t) => ({ label: t.q, data: `h=${t.key}` })),
    { label: "担当者に聞く", data: "m=staff" },
  ];
}

/**
 * 設定メニューの選択肢（現在値を見せてから切り替えさせる）。
 * ★プランによって使える機能が違うため、できないことは出さない。
 *   フリープランは自動投稿そのものが無い（maxPerDay=0）。
 */
export function settingsQuick(
  s: { autoPostEnabled?: boolean | null; autoPostRequireApproval?: boolean | null; postLength?: string | null },
  maxPerDay = 3,
  nextActionNotify = true,
): QuickItem[] {
  // 「次にやること」の案内は、いつでも止められる／戻せるようにしておく。
  const notifyToggle: QuickItem = nextActionNotify
    ? { label: "案内を受け取らない", data: "n=off" }
    : { label: "案内を受け取る", data: "n=on" };
  if (maxPerDay <= 0) {
    // 自動投稿が使えないプラン。切り替えても意味がないので出さない。
    return [
      { label: "プランを見る", data: "s=plan" },
      { label: "NGワードを追加", data: "s=ng" },
      notifyToggle,
    ];
  }
  return [
    { label: s.autoPostEnabled ? "自動投稿を止める" : "自動投稿を始める", data: `s=auto&v=${s.autoPostEnabled ? "off" : "on"}` },
    { label: s.autoPostRequireApproval ? "確認なしにする" : "公開前に確認する", data: `s=appr&v=${s.autoPostRequireApproval ? "off" : "on"}` },
    { label: "短め にする", data: "s=len&v=short" },
    { label: "長め にする", data: "s=len&v=long" },
    { label: "NGワードを追加", data: "s=ng" },
    notifyToggle,
  ];
}

export function settingsSummary(
  s: { autoPostEnabled?: boolean | null; autoPostRequireApproval?: boolean | null; postLength?: string | null; autoPostFrequency?: string | null },
  opts: { maxPerDay?: number; planName?: string; nextActionNotify?: boolean } = {},
): string {
  const notify = opts.nextActionNotify === false
    ? "・次にやることの案内：受け取らない\n"
    : "・次にやることの案内：受け取る\n";
  const maxPerDay = opts.maxPerDay ?? 3;
  const want = s.autoPostFrequency === "three_daily" ? 3 : s.autoPostFrequency === "twice_daily" ? 2 : 1;
  // 実際に投稿される回数は「設定した回数」と「プランの上限」の小さい方
  const actual = Math.min(want, maxPerDay);
  const len = s.postLength === "long" ? "長め" : s.postLength === "alternate" ? "短めと長めを交互" : "短め";
  const head = opts.planName ? `ご契約：${opts.planName}\n\n` : "";
  if (maxPerDay <= 0) {
    return (
      head + "いまの設定です。\n" +
      "・自動投稿：ご利用中のプランでは使えません（手動での作成はお試しいただけます）\n" +
      `・投稿の長さ：${len}\n` +
      notify + "\n" +
      "毎日の自動投稿をご利用になるには、プランのご変更が必要です。"
    );
  }
  return (
    head + "いまの設定です。\n" +
    `・自動投稿：${s.autoPostEnabled ? `ON（1日${actual}回）` : "OFF"}\n` +
    (want > maxPerDay ? `　※ ご利用中のプランの上限は1日${maxPerDay}回です\n` : "") +
    `・公開前の確認：${s.autoPostRequireApproval ? "する" : "しない"}\n` +
    `・投稿の長さ：${len}\n` +
    notify + "\n" +
    "変えたいものを選んでください。"
  );
}

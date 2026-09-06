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
  posts: Array<{ id: number; postContent: string | null; scheduledAt: Date | string | null; accountName?: string | null; angle?: string | null }>,
  opts: { one?: boolean; bulk?: boolean } = {},
): unknown {
  const suffix = opts.one ? "&o=1" : "";
  const bubbles = posts.slice(0, 5).map((p) => {
  // ★Meta AI呼びかけ投稿（angle=meta_ai_call）は、本文の「@meta.ai」が命。
  //   2026-09-06 朝、氷見様・梅原様が「書き直す」を押して普通の宣伝文に変わり、
  //   呼びかけとして公開されなかった。カードで正体を示し、AI書き直しは出さない。
  const isCall = p.angle === "meta_ai_call";
  return ({
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
          text: (p.accountName ? `@${p.accountName}　` : "") + `${fmtJst(p.scheduledAt)} 公開予定` + (isCall ? "・Meta AI呼びかけ投稿" : ""),
          size: "xs", color: "#0E8388", weight: "bold", wrap: true,
        },
        { type: "text", text: (p.postContent || "（本文なし）").slice(0, 900), wrap: true, size: "sm", color: "#13343B" },
        ...(isCall ? [{
          type: "text", wrap: true, size: "xs", color: "#8A6D3B",
          text: "Meta AIに呼びかけて、その返事でお店を広めてもらう投稿です。「@meta.ai」を残したまま、このまま公開するのがおすすめです。返事が付くかはThreads側の段階提供によります。",
        }] : []),
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
          // 呼びかけ投稿にはAIの「書き直す」を出さない（普通の宣伝文に変わってしまう）
          ...(isCall ? [] : [{ type: "button", style: "secondary", height: "sm",
            action: { type: "postback", label: "書き直す", data: `a=rw&i=${p.id}${suffix}`, displayText: "書き直す" } }]),
          { type: "button", style: "secondary", height: "sm",
            action: { type: "postback", label: "見送る", data: `a=skip&i=${p.id}${suffix}`, displayText: "見送る" } },
        ] },
        // ★本文をコピーして自分で直す（2026-09-06 氷見様ご要望）。
        //   このカードはFlexなので長押しコピーができず、スクショ→写真アプリで文字を拾って
        //   直されていた。押すと本文が普通のメッセージで届き、長押しでコピーできる。
        { type: "button", style: "link", height: "sm",
          action: { type: "postback", label: "文章をコピーして自分で直す", data: `a=selfedit&i=${p.id}${suffix}`, displayText: "文章をコピーして自分で直す" } },
      ],
    },
  }); });
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
/**
 * 「使い方」の分類。
 * ★LINEのクイックリプライは13個までしか出せない。質問を増やすほど押し出されて
 *   「聞きたいことが選択肢に無い」状態になるため、2段（分類→質問）にしている。
 */
export const HELP_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "daily", label: "毎日の投稿のこと" },
  { key: "settings", label: "設定を変えたい" },
  { key: "account", label: "アカウント・スタッフ" },
  { key: "pinned", label: "固定投稿のこと" },
  { key: "billing", label: "お支払い・プラン" },
  { key: "trouble", label: "うまくいかないとき" },
];

export const HELP_TOPICS: Array<{ key: string; cat: string; q: string; a: string; action?: QuickItem; directPostback?: string }> = [
  { key: "flow", cat: "daily", q: "毎日の流れは？",
    a: "毎日AIが投稿を作ります。承認モードがONなら、このトークに「今日の投稿」が届くので、内容を見て「これで投稿する」を押すだけです。書き直したいときは「書き直す」を押して、どう直すかを選ぶか、直接ご希望を送ってください。",
    action: { label: "今日の投稿を見る", data: "m=posts" } },
  { key: "auto", cat: "settings", q: "確認なしで全部おまかせにしたい",
    a: "公開前の確認をOFFにすると、確認なしで毎日自動で公開されます。あとから戻すこともできます。\n下のボタンで、いますぐ切り替えられます。",
    action: { label: "確認なしにする", data: "s=appr&v=off" } },
  { key: "metaai_reply", cat: "daily", q: "投稿に @meta.ai の返信が付いた",
    a: "2026年9月から、Threadsでは誰でも投稿の返信欄で @meta.ai を呼べるようになりました。お店の投稿にMeta AIの返信が付くことがあります。\n\n" +
      "気になるときは、次の3つで対応できます（@meta.ai はブロックできません）。\n" +
      "1. 自分の投稿に付いた返信を非表示にする：返信を長押し →「非表示」\n" +
      "2. @meta.ai をミュートする：@meta.ai のプロフィール → 右上の「…」→「ミュート」\n" +
      "3. 「興味がない」を選ぶ：返信の「…」→「興味がない」\n\n" +
      "Threads Studioの投稿は、はじめの設定で教えていただいた事実だけで作っているので、AIに確かめられても食い違いは出ません。" },
  { key: "metaai_ask", cat: "settings", q: "Meta AIを使って投稿を目立たせたい",
    a: "1日の投稿のうち1件として、「@meta.ai 〇〇市で肩こりに悩む人に、整体に通うメリットを伝えて」のような呼びかけ投稿を1日1件、朝〜昼に出しています（はじめからON）。\n" +
      "Meta AIがお店の名前を出してコメントで答えるので、投稿の下に会話ができ、届く人が増えます。実際に、通常の投稿の数倍〜十数倍の表示になった例があります。\n\n" +
      "依頼文は、はじめの設定で教えていただいた地域（最寄り駅・町名）・お客様像・店名から決まった型で作ります。止めたいときは「設定」からOFFにできます。\n\n" +
      "この機能はプロプラン・ビジネスプランでご利用いただけます。ライトプランの方は、プランを変更するとその日からお使いいただけます。\n\n" +
      "※ @meta.ai はThreadsの仕様で段階的に提供されており、まだ使えないアカウントもあります。その場合はMeta AIの返事が付きません（投稿自体はそのまま出ます）。使えるようになった時点で、そのまま効き始めます。",
    action: { label: "設定を見る", data: "m=settings" } },
  { key: "manual", cat: "account", q: "Threadsのアカウント作成から連携までのやり方",
    a: "Instagramのアカウント作成 → Threadsの開設 → Threads Studioとの連携までを、はじめての方向けに1ページにまとめています。\n" +
      "https://shittoruad-gif.github.io/shittoru-service-docs/threads-setup-manual.html\n\n" +
      "Threadsの連携だけは、パソコンのブラウザから行うのが確実です。",
    action: { label: "アカウント連携", data: "m=connect" } },
  { key: "ng", cat: "settings", q: "使ってほしくない言葉がある",
    a: "使ってほしくない言葉を登録すると、以後の投稿では自動的に避けます。\n下のボタンを押して、そのまま言葉をお送りください。",
    action: { label: "NGワードを追加", data: "s=ng" } },
  // ★選んだ時点で意図がはっきりしているので、説明を挟まずその場でコードを出す
  //   （コードは10分で失効し、出し直しても害がないため）
  { key: "member", cat: "account", q: "スタッフも操作できるようにしたい", a: "", directPostback: "m=addstaff" },
  { key: "members", cat: "account", q: "何人まで操作できますか？",
    a: "このトークから操作できる人数は、ご契約のプランで決まります。\n" +
      "・フリー／ライト（セミナー価格も同じ）：1人\n" +
      "・プロ（セミナー価格・モニター価格も同じ）：3人\n" +
      "・ビジネス：人数の制限なし\n\n" +
      "追加した方も、投稿の確認・承認・設定変更ができます（オーナーと同じ操作です）。\n" +
      "下のボタンを押すと、追加用の6桁のコードをお出しします。",
    action: { label: "スタッフを追加", data: "m=addstaff" } },
  { key: "multi", cat: "account", q: "2つ目のアカウントをつなぎたい",
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
  { key: "acctsettings", cat: "settings", q: "アカウントごとに設定を変えたい",
    a: "2つ以上のアカウントをつないでいる場合、投稿の設定はアカウントごとに変えられます。\n" +
      "・自動投稿のON／OFF\n" +
      "・公開前の確認をする／しない\n" +
      "・1日の投稿回数（アプリの設定画面から）\n" +
      "・投稿の長さ（短め／長め／交互）\n\n" +
      "「片方のアカウントだけ止める」「片方だけ確認あり」といった使い分けができます。\n" +
      "下の「設定」を押すと、アカウントごとの今の状態が一覧で出ます。そこから変えたいアカウントを選んでください。\n" +
      "※ 1つだけつないでいる場合は、これまでどおりの設定画面が出ます。",
    action: { label: "設定", data: "m=settings" } },
  { key: "makepin", cat: "pinned", q: "固定投稿を作りたい", a: "", directPostback: "m=makepin" },
  { key: "pin", cat: "pinned", q: "固定投稿のピン留めのやり方",
    a: "", directPostback: "n=pinhow" },
  { key: "stop", cat: "settings", q: "しばらく投稿を止めたい",
    a: "自動投稿をOFFにすると止まります。再開したいときは同じ場所でONにしてください。\n下のボタンで、いますぐ止められます。",
    action: { label: "自動投稿を止める", data: "s=auto&v=off" } },

  // ── 毎日の投稿のこと ──
  { key: "when", cat: "daily", q: "何時に投稿されますか？",
    a: "実測でいちばん反応が高い時間帯に合わせて公開します。\n" +
      "・1日1回：21時ごろ\n・1日2回：15時ごろ／21時ごろ\n・1日3回：15時ごろ／21時ごろ／22時ごろ\n\n" +
      "毎日ぴったり同じ時刻だと機械的に見えるため、それぞれ0〜29分のあいだでずらしています。\n" +
      "投稿の下書きは毎朝6時に作られます。お使いのうちに実績が貯まると、その方の反応が高い時間帯へ自動で寄っていきます。" },
  { key: "notcoming", cat: "daily", q: "投稿が来ません",
    a: "次の4つをご確認ください。\n" +
      "1. 自動投稿がONになっているか（「設定」で確認できます）\n" +
      "2. Threadsアカウントがつながっているか\n" +
      "3. ご契約のプランに自動投稿が含まれているか（フリープランには自動投稿がありません）\n" +
      "4. 「お店の情報」の登録が終わっているか（未登録だと投稿を作れません）\n\n" +
      "下のボタンで、いまの設定をご確認いただけます。それでも来ない場合は「担当者に聞く」からお知らせください。",
    action: { label: "設定", data: "m=settings" } },
  { key: "rewrite", cat: "daily", q: "届いた投稿の内容を直したい",
    a: "届いた投稿の「書き直す」を押すと、直し方を選べます（やわらかく・短く・具体的に など）。\n" +
      "ご自身の手で直したいときは「文章をコピーして自分で直す」を押してください。本文が普通のメッセージで届くので、長押し→コピーして、直した全文を送り返すだけです（全文を打ち直す必要はありません）。\n" +
      "ご希望を文章でそのまま送っていただいても直せます（例：「料金の話は入れないで」）。\n" +
      "ご自身で文章を打ち直したいときは「一部修正」を押してください。\n" +
      "今回は出したくない、というときは「見送る」を押すと公開されません。",
    action: { label: "今日の投稿を見る", data: "m=posts" } },
  { key: "posted", cat: "daily", q: "間違って投稿してしまった",
    a: "承認した直後であれば、同じトークに出る「取り消す」を押すと公開前に戻せます。\n" +
      "すでにThreadsへ公開されたあとは、こちらからは取り消せません。" +
      "お手数ですがThreadsアプリで、その投稿を削除してください（投稿右上の「…」→削除）。" },
  { key: "media", cat: "daily", q: "写真や動画は入れられますか？",
    a: "いまは文章だけの投稿に対応しています。写真・動画の自動投稿には対応していません。\n" +
      "画像を付けたい投稿は、お手数ですがThreadsアプリからご自身で投稿してください。" },
  { key: "tree", cat: "daily", q: "連続投稿（ツリー）はできますか？",
    a: "現在はお使いいただけません。連続投稿にはMeta社の追加の許可が必要で、いま審査の承認待ちです。\n" +
      "承認されるまでは、1投稿（500文字以内）でご利用ください。承認され次第、そのままお使いいただけるようになります。" },

  // ── 設定 ──
  { key: "count", cat: "settings", q: "投稿の回数を変えたい",
    a: "1日1回・2回・3回から選べます（ご契約のプランの上限まで）。\n" +
      "ライトは1日1回、プロ以上は1日3回まで投稿できます。\n" +
      "回数の変更はアプリの「設定」画面から行えます。下のボタンでリンクをお送りします。",
    action: { label: "設定", data: "m=settings" } },
  { key: "length", cat: "settings", q: "投稿の長さを変えたい",
    a: "「短め」「長め」「交互」から選べます。\n" +
      "・短め（50〜100字）：実測でいちばん見られる長さです\n" +
      "・長め（250〜300字）：悩みをじっくり書く型に向きますが、表示回数は落ちます\n" +
      "・交互：短めと長めを1本ずつ入れ替えて出し、どちらが効くか実データで比べます\n\n" +
      "下の「設定」から変えられます。",
    action: { label: "設定", data: "m=settings" } },
  { key: "editstore", cat: "settings", q: "お店の情報を直したい",
    a: "メニュー・強み・営業時間などを変えたときは、「お店の情報」から直せます。\n" +
      "直した内容は、次の投稿からすぐに反映されます。",
    action: { label: "お店の情報", data: "m=profile" } },

  // ── アカウント・スタッフ ──
  { key: "nothreads", cat: "account", q: "Threadsのアカウントが無い",
    a: "ThreadsのアカウントはInstagramのアカウントから作れます（Threadsアプリを入れて、Instagramでログインするだけです）。\n" +
      "Instagramをお持ちでない場合は、先にInstagramのアカウントを作ってください。\n" +
      "アカウントができたら、下のボタンから連携にお進みください。",
    action: { label: "アカウント連携", data: "m=connect" } },
  { key: "expire", cat: "account", q: "連携の有効期限はありますか？",
    a: "Threadsとの接続には60日の有効期限があります。\n" +
      "期限が近づくとお知らせが出るので、「接続を更新」を押していただくと60日延長されます。\n" +
      "期限が切れると投稿が公開できなくなるため、お知らせが届いたら早めにお願いします。",
    action: { label: "アカウント連携", data: "m=connect" } },
  { key: "area", cat: "account", q: "地域が違う店舗が複数あります",
    a: "「お店の情報」は店舗ごとに1つずつ登録してください（それぞれの地域を書きます）。\n" +
      "そのうえで、Threadsアカウントごとに「どのお店の情報を使うか」を紐づけます。\n" +
      "これで、各アカウントにはその店舗の地域の内容だけが投稿されます。\n" +
      "1つのお店の情報に複数の地域をまとめて書くと、投稿の地域が混ざるためおすすめしません。",
    action: { label: "お店・アカウント", data: "m=profile" } },

  // ── 固定投稿 ──
  { key: "whatpin", cat: "pinned", q: "固定投稿とは何ですか？",
    a: "プロフィールの一番上に固定しておく投稿のことです。\n" +
      "はじめて見に来た方が最初に読むため、公式LINEのご登録やご予約にいちばんつながります。\n" +
      "作ったあと、Threadsアプリでプロフィールにピン留めして、はじめて入口になります（作っただけでは流れていきます）。",
    action: { label: "固定投稿を作る", data: "m=makepin" } },

  // ── お支払い・プラン ──
  { key: "nextbill", cat: "billing", q: "次回の請求日と金額を知りたい",
    a: "アプリのホーム画面に、ご契約中のプラン・金額・次回のご請求日が表示されます。\n" +
      "下のボタンで、いまのご契約内容をお送りします。",
    action: { label: "プランを見る", data: "s=plan" } },
  { key: "changeplan", cat: "billing", q: "プランを変えたい",
    a: "アプリの「料金プラン」画面から、いつでもお手続きいただけます。\n" +
      "上位プランに変えると、Threadsアカウントの連携数・1日の投稿回数・操作できる人数が増えます。\n" +
      "お手続きで迷われる場合は「担当者に聞く」からお知らせください。",
    action: { label: "プランを見る", data: "s=plan" } },
  { key: "cancel", cat: "billing", q: "解約したいです",
    a: "アプリのホーム画面にある、ご契約状況の「解約」からお手続きいただけます。\n" +
      "無料トライアル中に解約された場合、料金は一切発生しません。\n" +
      "（紹介コードによるキャンペーン価格でのお申し込みは無料トライアルの対象外です）" },
  { key: "aftercancel", cat: "billing", q: "解約するとどうなりますか？",
    a: "フリープランに戻り、毎日の自動投稿は止まります。\n" +
      "これまでに登録された「お店の情報」や、作成・公開済みの投稿はそのまま残ります。\n" +
      "Threadsに公開済みの投稿が消えることもありません。\n" +
      "またお使いになりたくなったら、料金プランから再開できます（設定のやり直しは不要です）。" },
  { key: "trial", cat: "billing", q: "無料で試せますか？",
    a: "フリープランでしたら、ずっと無料でお試しいただけます（自動投稿は付きません）。\n" +
      "有料プランは、カードをご登録のうえ7日間無料でお試しいただけます。8日目から自動でお支払いが始まります。\n" +
      "※ 紹介コードによるキャンペーン価格でのお申し込みは無料トライアルの対象外で、お申し込み時に初回のお支払いが発生します。" },
  { key: "refcode", cat: "billing", q: "紹介コードを持っています",
    a: "お持ちのコードを、このトークにそのまま送ってください。\n" +
      "適用されると、そのコードの価格でお申し込みいただけるようになります。" },
  { key: "receipt", cat: "billing", q: "領収書はもらえますか？",
    a: "領収書は担当者が個別にお出しします。宛名と対象の月をそえて、下の「担当者に聞く」からお知らせください。",
    action: { label: "担当者に聞く", data: "m=staff" } },

  // ── うまくいかないとき ──
  { key: "linkng", cat: "trouble", q: "公式LINEの連携ができません",
    a: "「登録済みの方はこちら」を押して、アプリにご登録のメールアドレスを送っていただくと、6桁の番号をメールでお送りします。\n" +
      "その番号を、このトークにそのまま送ってください（10分間有効です）。\n\n" +
      "うまくいかないときは次をご確認ください。\n" +
      "・アプリにご登録のメールアドレスと同じか（違うメールだと番号が届きません）\n" +
      "・迷惑メールフォルダに入っていないか\n" +
      "・番号の有効期限（10分）が切れていないか（切れていたら、もう一度お送りします）",
    action: { label: "連携する", data: "m=link" } },
  { key: "buttonng", cat: "trouble", q: "申し込みボタンを押しても進みません",
    a: "スマートフォンでポップアップがブロックされていると、お支払い画面が開かないことがあります。\n" +
      "ボタンの下に出る「お支払い画面を開く」のリンクを押してみてください。\n" +
      "それでも開かない場合は、LINEのブラウザではなく、SafariやChromeなど通常のブラウザで開いてからお試しください。" },
  { key: "oauthng", cat: "trouble", q: "Threadsの連携から戻ってきません",
    a: "連携はMeta（Threads）の認証画面を通るため、LINEの中のブラウザではうまく戻れないことがあります。\n" +
      "お手数ですが、リンクを長押しして「デフォルトのブラウザで開く」を選ぶか、パソコンから連携してください。\n" +
      "連携が終わっているかどうかは、下のボタンでご確認いただけます。",
    action: { label: "アカウント連携", data: "m=connect" } },
  { key: "nomail", cat: "trouble", q: "メールが届きません",
    a: "迷惑メールフォルダをご確認ください。@threads-studio.com からのメールが受け取れる設定になっているかもご確認ください。\n" +
      "それでも届かない場合は、ご登録のメールアドレスが違っている可能性があります。「担当者に聞く」からお知らせください。",
    action: { label: "担当者に聞く", data: "m=staff" } },
  { key: "loginng", cat: "trouble", q: "ログインできません",
    a: "ログイン画面の「パスワードをお忘れですか？」から再設定できます。ご登録のメールアドレス宛にリンクをお送りします（1時間有効）。\n" +
      "毎日の確認や設定は、この公式LINEのトークだけでも行えます。アプリにログインできなくても、投稿は止まりません。" },
  { key: "replyng", cat: "trouble", q: "コメントに返信できません",
    a: "コメントへの返信の送信は、いまMeta社の追加審査の承認待ちです。\n" +
      "返信の文案はAIがお作りしますので、文案をコピーしてThreadsアプリから返信してください。\n" +
      "承認され次第、このトークからそのまま送れるようにします。" },
];

/** ヘルプの1段目＝分類を選ぶ（クイックリプライは13個までのため2段にしている） */
export function helpQuick(): QuickItem[] {
  // ★どのご質問にも当てはまらないときのために、最後に必ず担当者への導線を置く。
  return [
    ...HELP_CATEGORIES.map((c) => ({ label: c.label, data: `hc=${c.key}` })),
    { label: "担当者に聞く", data: "m=staff" },
  ];
}

/** ヘルプの2段目＝その分類の質問一覧 */
export function helpCategoryQuick(cat: string): QuickItem[] {
  return [
    ...HELP_TOPICS.filter((t) => t.cat === cat).map((t) => ({ label: t.q, data: `h=${t.key}` })),
    { label: "ほかの分類を見る", data: "m=help" },
    { label: "担当者に聞く", data: "m=staff" },
  ];
}

/**
 * 設定メニューの選択肢（現在値を見せてから切り替えさせる）。
 * ★プランによって使える機能が違うため、できないことは出さない。
 *   フリープランは自動投稿そのものが無い（maxPerDay=0）。
 */
export function settingsQuick(
  s: { autoPostEnabled?: boolean | null; autoPostRequireApproval?: boolean | null; postLength?: string | null; metaAiAskEnabled?: boolean | null },
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
    ...(maxPerDay >= 2
      ? [{ label: s.metaAiAskEnabled ? "Meta AI呼びかけ投稿を止める" : "Meta AI呼びかけ投稿をON", data: `s=metaai&v=${s.metaAiAskEnabled ? "off" : "on"}` }]
      : [{ label: "プランを見る", data: "s=plan" }]),
    { label: "NGワードを追加", data: "s=ng" },
    notifyToggle,
  ];
}

export function settingsSummary(
  s: { autoPostEnabled?: boolean | null; autoPostRequireApproval?: boolean | null; postLength?: string | null; autoPostFrequency?: string | null; metaAiAskEnabled?: boolean | null },
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
    `・Meta AI呼びかけ投稿：${maxPerDay < 2 ? "プロ・ビジネスプランで使えます（プランを変更するとその日から）" : s.metaAiAskEnabled ? "ON（1日の投稿のうち1件・朝〜昼）" : "OFF"}\n` +
    notify + "\n" +
    "変えたいものを選んでください。"
  );
}

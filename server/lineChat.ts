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
export function buildPostCards(posts: Array<{ id: number; postContent: string | null; scheduledAt: Date | string | null }>): unknown {
  const bubbles = posts.slice(0, 5).map((p) => ({
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        { type: "text", text: `${fmtJst(p.scheduledAt)} 公開予定`, size: "xs", color: "#8A9A9A" },
        { type: "text", text: (p.postContent || "（本文なし）").slice(0, 900), wrap: true, size: "sm", color: "#13343B" },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "button", style: "primary", color: "#0E8388", height: "sm",
          action: { type: "postback", label: "これで投稿する", data: `a=ok&i=${p.id}`, displayText: "これで投稿する" } },
        { type: "box", layout: "horizontal", spacing: "sm", contents: [
          { type: "button", style: "secondary", height: "sm",
            action: { type: "postback", label: "書き直す", data: `a=rw&i=${p.id}`, displayText: "書き直す" } },
          { type: "button", style: "secondary", height: "sm",
            action: { type: "postback", label: "見送る", data: `a=skip&i=${p.id}`, displayText: "見送る" } },
        ] },
      ],
    },
  }));
  return {
    type: "flex",
    altText: `承認待ちの投稿が${posts.length}件あります`,
    contents: bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles },
  };
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

// ── 画面を開かせずに返す各種テキスト ──────────────────────────
export const MENU_ITEMS: QuickItem[] = [
  { label: "今日の投稿", data: "m=posts" },
  { label: "コメント", data: "m=comments" },
  { label: "設定", data: "m=settings" },
  { label: "投稿の成績", data: "m=stats" },
  { label: "お店の情報", data: "m=profile" },
  { label: "使い方", data: "m=help" },
];

export const HELP_TOPICS: Array<{ key: string; q: string; a: string }> = [
  { key: "flow", q: "毎日の流れは？",
    a: "毎日AIが投稿を作ります。承認モードがONなら、このトークに「今日の投稿」が届くので、内容を見て「これで投稿する」を押すだけです。書き直したいときは「書き直す」を押して、どう直すかを選ぶか、直接ご希望を送ってください。" },
  { key: "auto", q: "確認なしで全部おまかせにしたい",
    a: "「設定」→「公開前の確認」をOFFにすると、確認なしで毎日自動で公開されます。あとから戻すこともできます。" },
  { key: "ng", q: "使ってほしくない言葉がある",
    a: "「設定」→「NGワードを追加」を押して、使ってほしくない言葉を送ってください。以後の投稿では自動的に避けます。" },
  { key: "member", q: "スタッフも操作できるようにしたい",
    a: "追加したい方が公式LINEを友だち追加したあと、こちらのトークで「追加」と送ってください。6桁のコードをお伝えします（連携できる人数はプランによって異なります）。" },
  { key: "stop", q: "しばらく投稿を止めたい",
    a: "「設定」→「自動投稿」をOFFにすると止まります。再開したいときは同じ場所でONにしてください。" },
];

/** ヘルプの選択肢 */
export function helpQuick(): QuickItem[] {
  return HELP_TOPICS.map((t) => ({ label: t.q, data: `h=${t.key}` }));
}

/** 設定メニューの選択肢（現在値を見せてから切り替えさせる） */
export function settingsQuick(s: { autoPostEnabled?: boolean | null; autoPostRequireApproval?: boolean | null; postLength?: string | null }): QuickItem[] {
  return [
    { label: s.autoPostEnabled ? "自動投稿を止める" : "自動投稿を始める", data: `s=auto&v=${s.autoPostEnabled ? "off" : "on"}` },
    { label: s.autoPostRequireApproval ? "確認なしにする" : "公開前に確認する", data: `s=appr&v=${s.autoPostRequireApproval ? "off" : "on"}` },
    { label: "短め にする", data: "s=len&v=short" },
    { label: "長め にする", data: "s=len&v=long" },
    { label: "NGワードを追加", data: "s=ng" },
  ];
}

export function settingsSummary(s: { autoPostEnabled?: boolean | null; autoPostRequireApproval?: boolean | null; postLength?: string | null; autoPostFrequency?: string | null }): string {
  const freq = s.autoPostFrequency === "three_daily" ? "1日3回" : s.autoPostFrequency === "twice_daily" ? "1日2回" : "1日1回";
  const len = s.postLength === "long" ? "長め" : s.postLength === "alternate" ? "短めと長めを交互" : "短め";
  return (
    "いまの設定です。\n" +
    `・自動投稿：${s.autoPostEnabled ? "ON（" + freq + "）" : "OFF"}\n` +
    `・公開前の確認：${s.autoPostRequireApproval ? "する" : "しない"}\n` +
    `・投稿の長さ：${len}\n\n` +
    "変えたいものを選んでください。"
  );
}

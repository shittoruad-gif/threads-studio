/**
 * コメント返信を「1タップ」にする（2026-09-07 三上様「交流を自動化でうまくできないか」）。
 *
 * Threadsは返信（会話）が付いた投稿を広く表示する。いちばん確実な交流は「自分の投稿に付いた
 * コメントへ早く返す」こと。これを自動で下書きし、LINEのカードから1タップで返信できるようにする。
 *  - 返信権限（threads_manage_replies）があるアカウント：「この文で送る」＝APIで即返信
 *  - 権限が無いアカウント：「Threadsアプリで返信する」＝投稿インテント（reply_post_shortcode）で
 *    文章入りの返信画面が開く。Meta AI呼びかけと同じ2タップ
 *  - フォロー・いいねの自動化はしない（新規アカウントの本人確認・停止の引き金になる）
 */
import { invokeLLM } from "./_core/llm";

export interface CommentItem {
  accountId: number;
  accountUsername: string;
  hasReplyScope: boolean;
  commentId: string;
  shortcode?: string | null;
  commenter?: string | null;
  commentText: string;
  parentText?: string | null;
  draft: string;
}

const RULES =
  "- 80文字以内。絵文字は0〜1個\n" +
  "- コメントの内容に具体的に触れ、お礼か共感を一言。質問には答えられる範囲で答え、分からなければ「詳しくはDMで」\n" +
  "- 事実か分からない数字・料金・効果・実績を作らない。「必ず治る」「◯日で改善」などの断定をしない\n" +
  "- 売り込みにしない。宣伝文・URL・ハッシュタグを入れない\n" +
  "- 店のオーナーが自分で打った短い返事に見える文にする。前置き・引用符なしで本文だけ";

export async function draftCommentReply(p: { commentText: string; commenter?: string | null; parentText?: string | null; storeName?: string | null }): Promise<string> {
  const prompt =
    `あなたは${p.storeName ? `「${p.storeName}」の` : ""}店のオーナーです。自分のThreads投稿に付いたコメントへ返信を1つ書いてください。\n\n` +
    (p.parentText ? `【自分の投稿】\n${String(p.parentText).slice(0, 300)}\n\n` : "") +
    `【コメント】${p.commenter ? `（@${p.commenter}）` : ""}\n${String(p.commentText).slice(0, 300)}\n\n【ルール】\n${RULES}`;
  const res: any = await invokeLLM({ temperature: 0.5, messages: [{ role: "user", content: prompt }] } as any);
  const out = String(res?.choices?.[0]?.message?.content ?? "").trim().replace(/^["「『]|["」』]$/g, "");
  return Array.from(out).length > 120 ? Array.from(out).slice(0, 120).join("") : out;
}

/** 投稿インテント：この返信（shortcode）に、文章入りで返信画面を開く */
export function buildReplyIntentUrl(shortcode: string, text: string): string {
  return `https://www.threads.com/intent/post?text=${encodeURIComponent(text)}&reply_post_shortcode=${encodeURIComponent(shortcode)}&openExternalBrowser=1`;
}

/** LINEのカード（1コメント1枚・最大5枚のカルーセル）＋説明文 */
export function buildCommentReplyCards(items: CommentItem[]): unknown[] {
  if (items.length === 0) return [];
  const bubbles = items.slice(0, 5).map((it) => {
    const footer: any[] = [];
    if (it.hasReplyScope) {
      footer.push({ type: "button", style: "primary", color: "#0E8388", height: "sm",
        action: { type: "postback", label: "この文で送る", data: `cr=send&a=${it.accountId}&c=${it.commentId}`, displayText: "この文で送る" } });
    }
    if (it.shortcode) {
      footer.push({ type: "button", style: it.hasReplyScope ? "secondary" : "primary", color: it.hasReplyScope ? undefined : "#0E8388", height: "sm",
        action: { type: "uri", label: "Threadsアプリで返信する", uri: buildReplyIntentUrl(it.shortcode, it.draft) } });
    }
    footer.push({ type: "button", style: "link", height: "sm",
      action: { type: "postback", label: "文案を作り直す", data: `cr=redo&a=${it.accountId}&c=${it.commentId}`, displayText: "文案を作り直す" } });
    return {
      type: "bubble", size: "mega",
      body: { type: "box", layout: "vertical", spacing: "md", contents: [
        { type: "text", text: `@${it.accountUsername} の投稿にコメント`, size: "xs", color: "#0E8388", weight: "bold", wrap: true },
        { type: "text", text: `${it.commenter ? `@${it.commenter}：` : ""}${it.commentText.slice(0, 200)}`, size: "sm", color: "#13343B", wrap: true },
        { type: "separator" },
        { type: "text", text: "返信の文案", size: "xs", color: "#6B7A78" },
        { type: "text", text: it.draft.slice(0, 300), size: "sm", color: "#13343B", wrap: true },
      ] },
      footer: { type: "box", layout: "vertical", spacing: "sm", contents: footer },
    };
  });
  const flex = { type: "flex", altText: `コメントが${items.length}件届いています。返信の文案つき`, contents: bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles } };
  const note = { type: "text", text:
    `コメントが${items.length}件届きました。返信が早いほど、投稿は多くの人に表示されます。\n` +
    (items.some((i) => i.hasReplyScope) ? "「この文で送る」で、その文のまま返信されます。" : "「Threadsアプリで返信する」を押すと、文章が入った返信画面が開きます。右下の「投稿」を押すだけです。") +
    "\n文を変えたいときは「文案を作り直す」を押すか、コピーして直してください。" };
  return [flex, note];
}

/** 返信権限のあるアカウントでAPIから返信する */
export async function sendReplyViaApi(accessToken: string, replyToId: string, text: string): Promise<{ id?: string; error?: string }> {
  const c: any = await (await fetch("https://graph.threads.net/v1.0/me/threads", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ media_type: "TEXT", text, reply_to_id: replyToId, access_token: accessToken }) })).json();
  if (!c?.id) return { error: JSON.stringify(c?.error ?? c).slice(0, 200) };
  await new Promise((r) => setTimeout(r, 2500));
  const p: any = await (await fetch("https://graph.threads.net/v1.0/me/threads_publish", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: c.id, access_token: accessToken }) })).json();
  if (!p?.id) return { error: JSON.stringify(p?.error ?? p).slice(0, 200) };
  return { id: String(p.id) };
}

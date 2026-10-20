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
  /** 勧誘・出会い系のときは空でよい（文案は作らない） */
  draft: string;
  /** 勧誘・出会い系と見分けたか（looksLikeSpamComment） */
  spam?: boolean;
}

const RULES =
  "- 80文字以内。絵文字は0〜1個\n" +
  "- コメントの内容に具体的に触れ、お礼か共感を一言。質問には答えられる範囲で答え、分からなければ「詳しくはDMで」\n" +
  "- 事実か分からない数字・料金・効果・実績を作らない。「必ず治る」「◯日で改善」などの断定をしない\n" +
  "- 売り込みにしない。宣伝文・URL・ハッシュタグを入れない\n" +
  "- 店のオーナーが自分で打った短い返事に見える文にする。前置き・引用符なしで本文だけ";

/**
 * コメントの種類ごとの返し方（2026-10-20 三上様「早急に進めて」・Threads集客講座 第03〜04回／他社noteの第5章）。
 *  - 一言（気になります・いいですね・わかる）→ お礼＋相手が答えやすい質問を1つ返して会話を広げる
 *    （Threadsは会話の続く投稿を広く出す。1往復で終わらせない）
 *  - 悩み・相談 → 共感を先に、答えられる範囲で一言、くわしくはDMで（断定・効果の約束はしない）
 *  - 質問 → 分かる事実だけ短く答える。料金・空き・効果など入力に無いことは「DMで」
 *  - 体験・感想 → お礼と、その人の言葉を1つ拾って返す
 */
export type CommentKind = "short" | "worry" | "question" | "other";

export function commentKindOf(text: string): CommentKind {
  const t = String(text ?? "").replace(/[\s　]+/g, "");
  const plain = t.replace(/[!！?？。、…〜ー~wｗ笑]+/g, "").replace(/(?:[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF])/g, "");
  if (/(痛|しびれ|痺れ|こり|コリ|張り|だるい|辛い|つらい|悩|困って|治らない|眠れない|疲れ|不調|重い|むくみ|浮腫|冷え|腰|肩|膝|首|頭痛|産後)/.test(t)) return "worry";
  if (/[?？]$|(ですか|ますか|でしょうか|かな|教えて|どうやって|どこで|いくら|何分|予約でき)/.test(t)) return "question";
  if (Array.from(plain).length <= 12) return "short";
  return "other";
}

const KIND_RULES: Record<CommentKind, string> = {
  short: "- このコメントは短い一言です。お礼を言ったうえで、相手が一言で答えられる質問を1つだけ返し、会話を続けてください（例：「どのあたりが気になりましたか？」）。質問は1つだけ",
  worry: "- このコメントは悩みや体の不調の話です。まず共感を一言。そのうえで、答えられる範囲で短く一言。くわしくは「よければDMで聞かせてください」で締める。原因の断定・効果の約束・受診の判断はしない",
  question: "- このコメントは質問です。投稿と入力から分かる事実だけで短く答える。料金・空き状況・効果など分からないことは作らず「DMでお伝えしますね」にする",
  other: "- コメントの中の言葉を1つ拾って、それに触れて返す",
};

export async function draftCommentReply(p: { commentText: string; commenter?: string | null; parentText?: string | null; storeName?: string | null }): Promise<string> {
  const kind = commentKindOf(p.commentText);
  const prompt =
    `あなたは${p.storeName ? `「${p.storeName}」の` : ""}店のオーナーです。自分のThreads投稿に付いたコメントへ返信を1つ書いてください。\n\n` +
    (p.parentText ? `【自分の投稿】\n${String(p.parentText).slice(0, 300)}\n\n` : "") +
    `【コメント】${p.commenter ? `（@${p.commenter}）` : ""}\n${String(p.commentText).slice(0, 300)}\n\n【ルール】\n${RULES}\n${KIND_RULES[kind]}`;
  const res: any = await invokeLLM({ temperature: 0.5, messages: [{ role: "user", content: prompt }] } as any);
  const out = String(res?.choices?.[0]?.message?.content ?? "").trim().replace(/^["「『]|["」』]$/g, "");
  return Array.from(out).length > 120 ? Array.from(out).slice(0, 120).join("") : out;
}

/** 投稿インテント：この返信（shortcode）に、文章入りで返信画面を開く */
export function buildReplyIntentUrl(shortcode: string, text: string): string {
  return `https://www.threads.com/intent/post?text=${encodeURIComponent(text)}&reply_post_shortcode=${encodeURIComponent(shortcode)}&openExternalBrowser=1`;
}

/**
 * LINEのカード（1コメント1枚・最大5枚のカルーセル）＋説明文。
 *
 * ★カードに出した文案は、ここで必ず保存する。「この文で送る」はこの保存分だけを送る。
 *   以前は送信時にもう一度AIに作らせていたため、カードに出した文とは別の文が
 *   返信されていた（2026-09-19 三上様ご指摘）。保存をこの1か所に置くことで、
 *   カードを出すどの経路（webhook・15分ごとの見回り・作り直し）でも取りこぼさない。
 */
export async function buildCommentReplyCards(items: CommentItem[]): Promise<unknown[]> {
  if (items.length === 0) return [];
  const db = await import("./db");
  for (const it of items) {
    if (!it.spam && it.draft) {
      try { await db.saveCommentReplyDraft(Number(it.accountId), String(it.commentId), it.draft); }
      catch { /* 保存できなくてもカードは出す。送信側は保存が無ければ送らずに作り直す */ }
    }
  }
  const bubbles = items.slice(0, 5).map((it) => {
    const footer: any[] = [];
    // ★勧誘・出会い系には文案を出さない。返信は相手への反応になり、
    //   新しいアカウントほど停止の引き金になりやすい（2026-09-17 ご質問 #37）。
    if (!it.spam) {
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
    }
    // ★「返信しない」をどのカードにも置く。これが無かったため、返さないと決めた方が
    //   文章で状況を書いて送るしかなく、担当者送りになっていた（ご質問 #37）。
    footer.push({ type: "button", style: it.spam ? "primary" : "link", color: it.spam ? "#0E8388" : undefined, height: "sm",
      action: { type: "postback", label: "返信しない", data: `cr=ignore&a=${it.accountId}&c=${it.commentId}`, displayText: "返信しない" } });
    const body: any[] = [
      { type: "text", text: `@${it.accountUsername} の投稿にコメント`, size: "xs", color: "#0E8388", weight: "bold", wrap: true },
      { type: "text", text: `${it.commenter ? `@${it.commenter}：` : ""}${it.commentText.slice(0, 200)}`, size: "sm", color: "#13343B", wrap: true },
      { type: "separator" },
    ];
    if (it.spam) {
      body.push(
        { type: "text", text: "勧誘・出会い系のコメントのようです", size: "xs", color: "#B45309", weight: "bold", wrap: true },
        { type: "text", text: "返信しないことをおすすめします。返信すると相手への反応になり、アカウントが止められやすくなります。文案もお作りしていません。", size: "sm", color: "#13343B", wrap: true },
      );
    } else {
      body.push(
        { type: "text", text: "返信の文案", size: "xs", color: "#6B7A78" },
        { type: "text", text: it.draft.slice(0, 300), size: "sm", color: "#13343B", wrap: true },
      );
    }
    return {
      type: "bubble", size: "mega",
      body: { type: "box", layout: "vertical", spacing: "md", contents: body },
      footer: { type: "box", layout: "vertical", spacing: "sm", contents: footer },
    };
  });
  const flex = { type: "flex", altText: `コメントが${items.length}件届いています。返信の文案つき`, contents: bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles } };
  const normal = items.filter((i) => !i.spam);
  const spamCount = items.length - normal.length;
  const note = { type: "text", text:
    `コメントが${items.length}件届きました。返信が早いほど、投稿は多くの人に表示されます。\n` +
    (normal.length > 0
      ? (normal.some((i) => i.hasReplyScope) ? "「この文で送る」で、その文のまま返信されます。" : "「Threadsアプリで返信する」を押すと、文章が入った返信画面が開きます。右下の「投稿」を押すだけです。") +
        "\n文を変えたいときは「文案を作り直す」を押すか、コピーして直してください。"
      : "") +
    (spamCount > 0
      ? `${normal.length > 0 ? "\n\n" : ""}※ ${spamCount}件は勧誘・出会い系のようでしたので、文案はお作りしていません。返信せず「返信しない」を押してください（返さないことで不利になることはありません）。`
      : "") };
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

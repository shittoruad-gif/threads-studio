/**
 * 期間限定の告知の投稿に付いたコメントへ、予約ページを自動で返す（2026-10-11 三上様指示）。
 *   「興味のある方は『整体』とコメントください」の告知（Moveact 金光・10/11〜10/12）に、
 *   コメントをくださった方へ空き時間と予約ページをお返しする。三上様が「自動で返す（案C）」を選んだ。
 *
 * 守り（9/12 に「リンク付きの同じ文の返信」を短い間にくり返して投稿が消されたため）：
 *  - 対象は PROMOS に書いた期間・アカウント・告知の投稿（scheduledPosts.angle）に付いたコメントだけ
 *  - 返す文は4通りを順に回し、同じ文を続けない。1回の見回りで返すのは2件まで・返信の間は30秒あける
 *  - 1人に1回だけ（Threads 側の会話に自分の返信が既にあれば返さない＝再起動しても二重にならない）
 *  - 期間の外・冷却中・返信権限が無いアカウントでは何もしない
 */
export interface Promo {
  key: string;
  accountId: number;
  /** 告知の投稿の目印（scheduledPosts.angle） */
  angle: string;
  /** 返してよい期間（JST・この日時まで） */
  fromJst: string;
  untilJst: string;
  url: string;
  /** 返事の文（{url} を予約ページに置き換える） */
  replies: string[];
}

export const PROMOS: Promo[] = [
  {
    key: "konko-seitai-1011",
    accountId: 12,
    angle: "promo_seitai_1011",
    fromJst: "2026-10-11T00:00:00+09:00",
    untilJst: "2026-10-12T21:00:00+09:00",
    url: "https://booking.moveact.net/menu/seitai-hisaichi-1011",
    replies: [
      "コメントありがとうございます。空いているお時間はこちらから見られます。10/11・10/12のお時間だけが出ます。\n{url}",
      "ありがとうございます。こちらのページから、空いているお時間を選んでご予約いただけます。\n{url}",
      "コメントうれしいです。2,980円の整体45分は、こちらからご予約いただけます（10/12まで）。\n{url}",
      "ありがとうございます。ご都合のよいお時間をこちらからお選びください。埋まったお時間は出ません。\n{url}",
    ],
  },
];

/** 返事をしてよいコメントか（申し込みの意思が読み取れる一言） */
export function wantsPromo(text: string): boolean {
  const t = String(text || "").replace(/\s/g, "");
  if (!t) return false;
  return /整体|受けたい|受けてみたい|興味|気になる|予約|行きたい|伺いたい|希望|お願いします|お願い致します|空いて|空き/.test(t);
}

export function replyTextFor(promo: Promo, n: number): string {
  const tpl = promo.replies[((n % promo.replies.length) + promo.replies.length) % promo.replies.length];
  return tpl.replace("{url}", promo.url);
}

export function inPromoWindow(promo: Promo, now: number = Date.now()): boolean {
  return now >= Date.parse(promo.fromJst) && now <= Date.parse(promo.untilJst);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runPromoCommentReplyJob(opts: { dryRun?: boolean; now?: number } = {}): Promise<void> {
  const now = opts.now ?? Date.now();
  const active = PROMOS.filter((p) => inPromoWindow(p, now));
  if (active.length === 0) return;
  const db: any = await import("./db");
  const { sql } = await import("drizzle-orm");
  const { inCooldown } = await import("../shared/accountRamp");
  const { createAndPublishPost } = await import("./threadsPost");
  const d = await db.getDb();
  for (const promo of active) {
    const account: any = await db.getThreadsAccountById(promo.accountId);
    if (!account || !account.isActive || account.hasReplyScope === 0 || account.hasReplyScope === false || inCooldown(account)) continue;
    const rows: any[] = ((await d.execute(sql`SELECT publishedThreadsPostId pid FROM scheduledPosts
      WHERE threadsAccountId = ${promo.accountId} AND angle = ${promo.angle} AND status = 'posted' AND publishedThreadsPostId IS NOT NULL`)) as any)[0];
    let sent = 0;
    for (const r of rows) {
      if (sent >= 2) break;
      const url = `https://graph.threads.net/v1.0/${r.pid}/conversation?fields=id,text,username,timestamp,replied_to&reverse=true&access_token=${account.accessToken}`;
      const res = await fetch(url).catch(() => null);
      if (!res || !res.ok) { console.warn(`[PromoReply] 会話を取れない post=${r.pid} status=${res?.status}`); continue; }
      const items: any[] = ((await res.json()) as any)?.data ?? [];
      const own = String(account.threadsUsername || "");
      const answered = new Set(items.filter((x) => x.username === own && x.replied_to?.id).map((x) => String(x.replied_to.id)));
      const answeredUsers = new Set(items.filter((x) => x.username === own && x.replied_to?.id)
        .map((x) => items.find((y) => y.id === x.replied_to.id)?.username).filter(Boolean));
      const ownReplies = items.filter((x) => x.username === own && x.replied_to?.id).length;
      for (const c of items) {
        if (sent >= 2) break;
        if (!c.username || c.username === own || /^meta\.ai$/i.test(c.username)) continue;
        if (answered.has(String(c.id)) || answeredUsers.has(c.username)) continue;
        if (!wantsPromo(c.text)) continue;
        const text = replyTextFor(promo, ownReplies + sent + Number(String(c.id).slice(-1)) );
        if (opts.dryRun) { console.log(`[PromoReply] (試し) @${c.username}「${String(c.text).slice(0, 40)}」→ ${text.split("\n")[0]}`); sent++; continue; }
        try {
          if (sent > 0) await sleep(30_000);
          const out = await createAndPublishPost({ accessToken: account.accessToken, threadsUserId: account.threadsUserId, text, mediaType: "TEXT", replyToId: String(c.id) } as any);
          sent++;
          answeredUsers.add(c.username);
          console.log(`[PromoReply] ${promo.key} @${c.username} へ返信 reply=${out?.id}`);
        } catch (e) {
          console.error(`[PromoReply] 返信に失敗 ${promo.key} comment=${c.id}:`, e);
        }
      }
    }
  }
}

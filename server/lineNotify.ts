/**
 * LINE通知連携（段階1: 受け取る・承認する）。
 *
 * Threads Studio 専用の公式LINEアカウントから、
 *   - 承認モードの「投稿ができました」通知（1回の生成につき1通にまとめる）
 *   - 新着コメント通知
 * をプッシュし、承認は既存のワンタップ承認URL（/api/post-approval）を
 * ボタンで開くだけにする。承認ロジック自体は一切増やさない。
 *
 * 連携の仕組み:
 *   設定画面で6桁コードを発行 → 公式LINEを友だち追加してコードを送る →
 *   Webhookがコードを照合して users.lineUserId に紐づけ。
 *   「解除」と送れば連携解除。
 *
 * 通数の考え方（LINE無料枠200通/月、ライト5,000通/月5,000円）:
 *   承認は1日1通のダイジェスト・コメントは1日1通まで。
 *   1ユーザー月40〜60通程度に収まる設計にする。
 *
 * 環境変数（未設定なら全機能が静かに無効＝既存動作に影響しない）:
 *   LINE_NOTIFY_CHANNEL_SECRET / LINE_NOTIFY_CHANNEL_ACCESS_TOKEN
 *   LINE_NOTIFY_ADD_URL（友だち追加URL。設定画面の案内に使う）
 */

import crypto from "crypto";

const API_BASE = "https://api.line.me/v2/bot";

export function lineNotifyEnabled(): boolean {
  return Boolean(
    process.env.LINE_NOTIFY_CHANNEL_SECRET && process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN,
  );
}

/** Webhook署名の検証（LINEはボディのHMAC-SHA256をbase64で送ってくる） */
export function verifyLineSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
  const secret = process.env.LINE_NOTIFY_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const mac = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** 6桁の連携コードを作る（衝突しても照合時に userId 側で一意） */
export function generateLinkCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

/** 連携コードの有効期限（10分） */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;

/**
 * 月間の通数を使い切ったか（LINEは429 + "monthly limit" で返す）。
 *
 * 2026-09-09、無料枠200通を使い切って24時間で push が22件すべて 429 になり、
 * 承認依頼・投稿のお知らせがどなたにも届かなかった。届かなかったことに
 * こちらが気づけたのは翌朝の点検だった。以降は「メールで同じ内容をお届けし、
 * 運営にも知らせる」ところまでを push の中でやる。
 */
export function isLineQuotaError(status: number, body: string): boolean {
  return status === 429 && /monthly limit|quota/i.test(body);
}

/** 枠切れを運営へ知らせるのは1日1回まで（同じ通知を何十通も出さない） */
let quotaAlertedOn: string | null = null;

/** LINEの文章メッセージだけを取り出す（メールへ振り替える本文に使う） */
function textOf(messages: unknown[]): string {
  const out: string[] = [];
  for (const m of messages as any[]) {
    if (m?.type === "text" && m.text) out.push(String(m.text));
    else if (m?.type === "template" && m.altText) out.push(String(m.altText));
    else if (m?.type === "flex" && m.altText) out.push(String(m.altText));
  }
  return out.join("\n\n").trim();
}

/**
 * LINEが送れなかったときに、同じ内容をメールでお届けする。
 * 本文が取り出せない（画像・カードだけ）ときは何もしない。
 */
async function fallbackToEmail(lineUserId: string, messages: unknown[], reason: string): Promise<void> {
  const body = textOf(messages);
  if (!body) return;
  try {
    const [{ getUserByLineUserId }, { sendEmail }] = await Promise.all([
      import("./db"),
      import("./_core/notification"),
    ]);
    const user: any = await getUserByLineUserId(lineUserId);
    if (!user?.email) return;
    const { escapeHtml } = await import("../shared/sanitize");
    await sendEmail({
      to: user.email,
      subject: "【Threads Studio】LINEでお送りできなかったお知らせ",
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <p>いつもご利用ありがとうございます。<br>本来LINEでお届けする内容が、送信の上限に達したためお送りできませんでした。同じ内容をメールでお届けします。</p>
        <div style="white-space:pre-wrap;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">${escapeHtml(body)}</div>
        <p style="color:#666;font-size:13px;">ご不便をおかけします。LINEは復旧しだい元どおりお届けします。</p>
      </div>`,
    });
    console.log(`[LineNotify] push不可（${reason}）→ ${user.email} へメールで振り替えた`);
  } catch (e) {
    console.error("[LineNotify] メールへの振り替えに失敗:", (e as Error)?.message);
  }
}

/** 枠切れを運営へ1日1回だけ知らせる */
async function alertStaffQuotaExhausted(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (quotaAlertedOn === today) return;
  quotaAlertedOn = today;
  try {
    const { sendEmail } = await import("./_core/notification");
    const q = await fetchLineQuota();
    await sendEmail({
      to: process.env.ADMIN_NOTIFICATION_EMAIL || "shittoru.ad@gmail.com",
      subject: "【Threads Studio】LINEの月間通数を使い切りました（お客様への通知がメールに切り替わっています）",
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>LINEの月間通数を使い切りました</h2>
        <p>公式LINEからのプッシュ通知が送れない状態です。お客様には同じ内容をメールでお届けしていますが、
        LINEのプランを上げるまで、承認依頼や投稿のお知らせはLINEに届きません。</p>
        <p>いまの残量：${q ? `${q.limit === null ? "無制限" : `上限 ${q.limit} 通 / 使用 ${q.used} 通`}` : "取得できませんでした"}</p>
      </div>`,
    });
  } catch (e) {
    console.error("[LineNotify] 枠切れの通知に失敗:", (e as Error)?.message);
  }
}

/**
 * 月間通数の残量。朝の点検と枠切れ通知で使う。
 * limit=null は無制限プラン。
 */
export async function fetchLineQuota(): Promise<{ limit: number | null; used: number; remaining: number | null } | null> {
  const token = process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const [qr, cr] = await Promise.all([
      fetch(`${API_BASE}/message/quota`, { headers }),
      fetch(`${API_BASE}/message/quota/consumption`, { headers }),
    ]);
    if (!qr.ok || !cr.ok) return null;
    const q = (await qr.json()) as { type?: string; value?: number };
    const c = (await cr.json()) as { totalUsage?: number };
    const limit = q.type === "limited" && typeof q.value === "number" ? q.value : null;
    const used = Number(c.totalUsage ?? 0);
    return { limit, used, remaining: limit === null ? null : Math.max(0, limit - used) };
  } catch {
    return null;
  }
}

async function pushMessage(lineUserId: string, messages: unknown[]): Promise<boolean> {
  const token = process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN;
  if (!token) return false;
  const res = await fetch(`${API_BASE}/message/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: lineUserId, messages }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[LineNotify] push失敗 ${res.status}: ${body.slice(0, 200)}`);
    // ★通数を使い切って届かなかったときは、黙って消さずメールで同じ内容をお届けする。
    //   （2026-09-09 22通すべてが 429 で消え、翌朝まで誰も気づけなかった）
    if (isLineQuotaError(res.status, body)) {
      await fallbackToEmail(lineUserId, messages, `LINE ${res.status}`);
      await alertStaffQuotaExhausted();
    }
    return false;
  }
  return true;
}

/**
 * LINEの表示名を取得する（友だち追加済みユーザーのみ・失敗しても null）。
 * 設定画面の連携一覧で「誰のLINEか」を見せるためだけに使う。
 */
export async function fetchLineDisplayName(lineUserId: string): Promise<string | null> {
  const token = process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { displayName?: string };
    return data.displayName ?? null;
  } catch {
    return null;
  }
}

/** 受信への返信（replyTokenを使う。プッシュ通数を消費しない） */
export async function replyMessage(replyToken: string, text: string): Promise<void> {
  const token = process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN;
  if (!token) return;
  await fetch(`${API_BASE}/message/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  }).catch((e) => console.error("[LineNotify] reply失敗:", e));
}

export interface ApprovalPushPost {
  id: number;
  postContent: string | null;
  scheduledAt: Date | string | null;
}

function fmtTime(v: Date | string | null): string {
  if (!v) return "";
  const d = new Date(v);
  // DBはUTC。日本時間で表示する
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * 承認依頼のLINEメッセージを組み立てる（1通にまとめる）。
 * 承認ボタンは既存のワンタップ承認ページを開くだけ。
 */
export function buildApprovalMessages(
  posts: ApprovalPushPost[],
  approvalUrlFor: (postId: number) => string,
): unknown[] {
  const head = {
    type: "text",
    text:
      `明日の投稿が${posts.length}件できました。\n` +
      `内容を見て、よければ承認してください（1分で終わります）。`,
  };
  // ボタンテンプレートは最大4ボタン・本文60字制限があるためFlexで組む
  const bubbles = posts.slice(0, 5).map((p) => ({
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "text", text: fmtTime(p.scheduledAt) + " 公開予定", size: "xs", color: "#888888" },
        {
          type: "text",
          text: (p.postContent || "").slice(0, 120) || "（本文なし）",
          wrap: true,
          size: "sm",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#059669",
          height: "sm",
          action: { type: "uri", label: "内容を見て承認する", uri: approvalUrlFor(p.id) },
        },
      ],
    },
  }));
  const flex = {
    type: "flex",
    altText: `明日の投稿が${posts.length}件できました（承認待ち）`,
    contents: bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles },
  };
  return [head, flex];
}

/**
 * 承認依頼を1通のダイジェストで送る。
 * ★2026-09-01: Webビューを開かせず、トーク内のボタン（postback）で
 *   承認・書き直し・見送りまで終わるカードに変更。
 */
export async function sendApprovalPush(
  lineUserId: string,
  posts: ApprovalPushPost[],
  _approvalUrlFor?: (postId: number) => string,
): Promise<boolean> {
  if (!lineNotifyEnabled() || posts.length === 0) return false;
  const { buildPostCards } = await import("./lineChat");
  // ★「今日」か「明日」かは予定時刻で決める。
  //   朝6時の定例は当日15/21/22時に置くので「今日」、お申し込み直後の当日補充も「今日」。
  //   以前は常に「明日の投稿」と書いていて、実際には数時間後に公開されていた。
  const jstDate = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const first = posts
    .map((p) => (p.scheduledAt ? new Date(p.scheduledAt as any) : null))
    .filter((d): d is Date => !!d && !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const label = !first || jstDate(first) === jstDate(new Date()) ? "今日" : "明日";
  // ★2026-09-12 既定を「見送りしなければ予定時刻に公開」に変更。押せない日があっても投稿は止まらない
  const tail = posts.length > 1
    ? "内容をご確認ください。「見送る」を押さない限り、予定時刻にそのまま公開されます。直したいときは「書き直す」、出したくないときだけ「見送る」を押してください。"
    : "内容をご確認ください。「見送る」を押さない限り、予定時刻にそのまま公開されます。直したいときは「書き直す」を押してください。";
  return pushMessage(lineUserId, [
    { type: "text", text: `${label}の投稿が${posts.length}件できました。\n${tail}` },
    buildPostCards(posts as any, { bulk: true }),
  ]);
}

/** 新着コメント通知（1通・リンクはコメント管理画面へ） */
export async function sendCommentPush(
  lineUserId: string,
  count: number,
  previews: string[],
  managerUrl: string,
): Promise<boolean> {
  if (!lineNotifyEnabled() || count === 0) return false;
  const lines = previews.slice(0, 3).map((t) => `・${t.slice(0, 60)}`);
  return pushMessage(lineUserId, [
    {
      type: "text",
      text:
        `投稿にコメントが${count}件届いています。\n` +
        lines.join("\n") +
        `\n\n返信の文案はAIが用意しています。\n${managerUrl}`,
    },
  ]);
}

// ── LIFF（LINEトーク内でアプリを開く）─────────────────────────
// 環境変数（未設定ならLIFF機能は無効・従来のURLで動く）:
//   LIFF_ID … LINEログインチャネルに作成したLIFFアプリのID
//   LIFF_LOGIN_CHANNEL_ID … そのLINEログインチャネルのチャネルID（IDトークン検証用）

export function liffEnabled(): boolean {
  return Boolean(process.env.LIFF_ID && process.env.LIFF_LOGIN_CHANNEL_ID);
}

/**
 * アプリ内パスをLIFF URLに変換する（LIFF未設定なら通常URLを返す）。
 * LIFFのエンドポイントは /liff で、?path= に開きたいページを渡す。
 */
export function liffUrl(path: string, base: string): string {
  if (!liffEnabled()) return `${base}${path}`;
  return `https://liff.line.me/${process.env.LIFF_ID}?path=${encodeURIComponent(path)}`;
}

/**
 * LINEログインのIDトークンを検証して、LINEのuserId（sub）を返す。
 * 検証はLINE公式のverifyエンドポイントに任せる（署名・期限・audをまとめて確認してくれる）。
 */
export async function verifyLineIdToken(idToken: string): Promise<string | null> {
  const clientId = process.env.LIFF_LOGIN_CHANNEL_ID;
  if (!clientId || !idToken) return null;
  try {
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[LineNotify] IDトークン検証失敗 ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as { sub?: string };
    return data.sub ?? null;
  } catch (e) {
    console.error("[LineNotify] IDトークン検証エラー:", e);
    return null;
  }
}

/** 連携完了・解除などの短い定型文 */
export const LINE_TEXTS = {
  linked:
    "連携できました。これから、明日の投稿ができるたびにこのトークでお知らせします。\n\n" +
    "届いた投稿は「これで投稿する」「書き直す」「見送る」のボタンで、そのまま決められます。\n" +
    "下のメニューからは、いつでも今日の投稿の確認・設定の変更ができます。",
  linkFailed: "番号が確認できませんでした。メールに届いた6桁の番号を、そのまま送ってください（有効期限は10分です）。\n番号が届いていない場合は、下の「連携する」からもう一度お試しください。",
  linkLimit: "ご利用中のプランで連携できるLINEの人数が上限に達しています。設定画面で不要な連携を解除するか、上位プランへの変更をご検討ください。",
  unlinked: "連携を解除しました。再開したいときは、アプリの設定画面からいつでも連携できます。",
  greeting:
    "友だち追加ありがとうございます。\n" +
    "Threads StudioのLINE窓口です。\n\n" +
    "毎日の投稿の確認・書き直し・設定の変更は、このトークの中だけで終わります（アプリを開く必要はありません）。\n\n" +
    "ご利用にはアカウントの登録が必要です。\n" +
    "はじめての方は下の「会員登録する」から、3分ほどで作れます。\n" +
    "すでにご登録済みの方は「登録済みの方はこちら」を押してください。",
} as const;

/** 任意のメッセージ配列をreplyで返す（チャット完結操作用・通数を消費しない） */
/** 指定のLINEユーザーに、組み立て済みのメッセージをお送りする（ボタン付きの案内など）。 */
export async function pushMessages(lineUserId: string, messages: unknown[]): Promise<boolean> {
  return pushMessage(lineUserId, messages);
}

/**
 * 指定のLINEユーザーに、文章を1通お送りする。
 * 担当者からの返信・運営への通知に使う（push APIなので通数課金の対象）。
 */
export async function pushTextTo(lineUserId: string, text: string): Promise<boolean> {
  return pushMessage(lineUserId, [{ type: "text", text: text.slice(0, 4900) }]);
}

export async function replyMessages(replyToken: string, messages: unknown[], fallbackTo?: string): Promise<void> {
  const token = process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken || messages.length === 0) return;
  // ★処理に時間がかかった（ホームページを読む・AIに聞く）あとは reply token が期限切れになることがある。
  //   その場合は push で同じ内容を届ける（黙って何も返さない、を防ぐ。2026-09-10）。
  let fallback = false;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
    });
    if (!res.ok) {
      console.error(`[LineNotify] reply失敗 ${res.status}: ${(await res.text()).slice(0, 200)}`);
      fallback = true;
    }
  } catch (e) {
    console.error("[LineNotify] reply エラー:", e);
    fallback = true;
  }
  if (fallback && fallbackTo) {
    try { await pushMessages(fallbackTo, messages.slice(0, 5)); } catch (e) { console.error("[LineNotify] reply→push の切り替えに失敗:", e); }
  }
}

// ── リッチメニューの出し分け ───────────────────────────────
// 既定メニュー = 未連携むけ（「連携する」だけを見せる）。
// 連携が成立した人だけ、その人専用に「通常メニュー（6ボタン）」へ切り替える。
// ※ すでに友だち追加済みの方にはあいさつ文が再送されないため、
//   メニュー自体を入口にしないと「連携する」に辿り着けない。
let mainMenuIdCache: string | null = null;

/** 通常メニューのIDを得る（envが無ければ名前で探して覚える） */
export async function getMainRichMenuId(): Promise<string | null> {
  if (process.env.LINE_RICHMENU_MAIN_ID) return process.env.LINE_RICHMENU_MAIN_ID;
  if (mainMenuIdCache) return mainMenuIdCache;
  const token = process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch("https://api.line.me/v2/bot/richmenu/list", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const hit = (data.richmenus ?? []).find((m: any) => String(m.name || "").startsWith("threads-studio-main-"));
    mainMenuIdCache = hit?.richMenuId ?? null;
    return mainMenuIdCache;
  } catch {
    return null;
  }
}

/** 連携が済んだ人を、通常メニューに切り替える（失敗しても連携自体は成立させる） */
export async function switchToMainRichMenu(lineUserId: string): Promise<void> {
  const token = process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN;
  const menuId = await getMainRichMenuId();
  if (!token || !menuId) return;
  try {
    await fetch(`https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${menuId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    console.error("[LineNotify] リッチメニュー切替に失敗:", e);
  }
}

/** 連携を解除した人を、既定（未連携むけ）メニューに戻す */
export async function resetToDefaultRichMenu(lineUserId: string): Promise<void> {
  const token = process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    console.error("[LineNotify] リッチメニュー戻しに失敗:", e);
  }
}


/**
 * 連携済みの方を、まとめて通常メニューへ切り替える（起動時に1回だけ）。
 * 既定メニューを「未連携むけ」にしたため、それ以前から連携していた方が
 * 2ボタンのまま取り残されるのを直すためのもの。
 */
let reconciled = false;
export async function reconcileRichMenus(): Promise<void> {
  if (reconciled || !lineNotifyEnabled()) return;
  reconciled = true;
  try {
    const db = await import("./db");
    const ids = await db.listAllLinkedLineUserIds();
    if (ids.length === 0) return;
    for (const id of ids) await switchToMainRichMenu(id);
    console.log(`[LineNotify] リッチメニューを是正: ${ids.length}件を通常メニューへ`);
  } catch (e) {
    console.error("[LineNotify] リッチメニュー一括是正に失敗:", e);
  }
}

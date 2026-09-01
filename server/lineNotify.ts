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
  return pushMessage(lineUserId, [
    {
      type: "text",
      text: `明日の投稿が${posts.length}件できました。\n内容を見て、下のボタンを押すだけで終わります。`,
    },
    buildPostCards(posts as any),
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
  linkFailed: "コードが確認できませんでした。アプリの設定画面で表示された6桁のコードを、そのまま送ってください（有効期限10分）。",
  linkLimit: "ご利用中のプランで連携できるLINEの人数が上限に達しています。設定画面で不要な連携を解除するか、上位プランへの変更をご検討ください。",
  unlinked: "連携を解除しました。再開したいときは、アプリの設定画面からいつでも連携できます。",
  greeting:
    "友だち追加ありがとうございます。\n" +
    "Threads StudioのLINE窓口です。\n\n" +
    "毎日の投稿の確認・書き直し・設定の変更は、このトークの中だけで終わります（アプリを開く必要はありません）。\n\n" +
    "まず、お使いのアカウントとつなぎます。下の「連携する」を押してください。",
} as const;

/** 任意のメッセージ配列をreplyで返す（チャット完結操作用・通数を消費しない） */
export async function replyMessages(replyToken: string, messages: unknown[]): Promise<void> {
  const token = process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken || messages.length === 0) return;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
    });
    if (!res.ok) {
      console.error(`[LineNotify] reply失敗 ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  } catch (e) {
    console.error("[LineNotify] reply エラー:", e);
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

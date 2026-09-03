/**
 * Univapay API wrapper for subscription management
 * Using REST API directly (no official SDK available)
 */
// ★require('crypto')はESMバンドルで実行時に落ちて検証が常にfalseになるため、
//   必ず静的importを使うこと（2026-08-14 本番のWebhook 400で発覚）。
import { createHmac, timingSafeEqual } from "crypto";

const UNIVAPAY_API_URL = 'https://api.univapay.com';
const UNIVAPAY_JWT_TOKEN = process.env.UNIVAPAY_JWT_TOKEN!;
const UNIVAPAY_SECRET = process.env.UNIVAPAY_SECRET ?? '';
const UNIVAPAY_STORE_ID = process.env.UNIVAPAY_STORE_ID!;

// UnivaPay公式ドキュメント(docs.univapay.com/en/References/authentication/)より：
// secretありの場合は "Bearer {secret}.{jwt}" の順（secretが先、jwtが後）。
// 逆順(jwt.secret)は無効なトークンとして拒否される。secretが無い場合はjwt単体。
function buildAuthorizationHeader(): string {
  if (UNIVAPAY_JWT_TOKEN && UNIVAPAY_SECRET) {
    return `Bearer ${UNIVAPAY_SECRET}.${UNIVAPAY_JWT_TOKEN}`;
  }
  return `Bearer ${UNIVAPAY_JWT_TOKEN}`;
}

/**
 * Make authenticated request to Univapay API
 */
async function univapayRequest(
  endpoint: string,
  method: string = 'GET',
  body?: any
) {
  const url = `${UNIVAPAY_API_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Authorization': buildAuthorizationHeader(),
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  // ★429（レート制限）は少し待って再試行する。管理画面の契約一覧が
  //   トークン照会を連続で呼ぶと 429 が続き、契約が欠けて表示されていた（2026-09-03）。
  const MAX_TRY = 4;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429 && attempt < MAX_TRY) {
        const ra = Number(response.headers.get('retry-after'));
        const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 800 * attempt;
        console.warn(`[Univapay] 429 rate limited → ${waitMs}ms 待って再試行 (${attempt}/${MAX_TRY - 1}) ${endpoint}`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Univapay] API error:', response.status, errorText);
        throw new Error(`Univapay API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[Univapay] Request error:', error);
      throw error;
    }
  }
}

/**
 * Create a charge for one-time payment
 */
export async function createCharge(
  amount: number,
  currency: string,
  metadata?: Record<string, string>
) {
  try {
    const charge = await univapayRequest('/charges', 'POST', {
      store_id: UNIVAPAY_STORE_ID,
      amount,
      currency,
      metadata,
    });
    return charge;
  } catch (error) {
    console.error('[Univapay] Create charge error:', error);
    throw error;
  }
}

/**
 * Create a subscription
 */
export async function createSubscription(
  planId: string,
  userId: string,
  metadata?: Record<string, string>
) {
  try {
    // In link form approach, subscription is created via webhook
    // This function is for reference only
    console.log('[Univapay] Subscription will be created via link form and webhook');
    return { planId, userId, metadata };
  } catch (error) {
    console.error('[Univapay] Create subscription error:', error);
    throw error;
  }
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(subscriptionId: string) {
  try {
    const result = await univapayRequest(
      `/stores/${UNIVAPAY_STORE_ID}/subscriptions/${subscriptionId}`,
      'DELETE'
    );
    console.log('[Univapay] Subscription canceled:', subscriptionId);
    return result;
  } catch (error) {
    console.error('[Univapay] Cancel subscription error:', error);
    throw error;
  }
}

/**
 * Update subscription plan
 */
export async function updateSubscription(
  subscriptionId: string,
  newPlanId: string
) {
  try {
    // Univapay doesn't support direct plan change
    // Need to cancel old subscription and create new one
    await cancelSubscription(subscriptionId);
    console.log('[Univapay] Subscription plan updated (canceled old, need to create new)');
    return { subscriptionId, newPlanId };
  } catch (error) {
    console.error('[Univapay] Update subscription error:', error);
    throw error;
  }
}

/**
 * 既存サブスクリプションの「次回以降の課金金額」を変更する（PATCH）。
 *
 * 用途：キャンペーン価格で3回課金 → 4回目から通常価格へ自動切替（解約せず金額だけ上げる）。
 *
 * 確定仕様（Univatpay公式API: PATCH /stores/{storeId}/subscriptions/{subscriptionId}）：
 *  - `amount`            … 次々回以降に適用される継続金額
 *  - `next_payment.amount` … 次回課金のみに適用される金額
 *  両方を新価格に設定することで「次回課金から以降ずっと新価格」になる。
 *
 * 重要な前提（Univapay仕様・2026-07-21 公式docs再確認）：
 *  - 「回数指定あり」の定期課金では金額を変更できない → キャンペーン契約のリンクは必ず回数指定なし（無制限）で作成すること。
 *  - 増額に上限の規定は無い（「課金金額上限」という設定はUnivaPayに存在しない。リンクフォームにも該当欄なし）。
 *  - 変更できるのは status が unconfirmed / unpaid / current / suspended のとき。
 *  - 本番有効化前に必ずUnivapayテスト環境で実挙動を検証すること。
 */
export async function updateSubscriptionNextAmount(
  subscriptionId: string,
  nextAmount: number,
) {
  if (!subscriptionId) throw new Error('subscriptionId is required');
  if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
    throw new Error(`invalid nextAmount: ${nextAmount}`);
  }
  const result = await univapayRequest(
    `/stores/${UNIVAPAY_STORE_ID}/subscriptions/${subscriptionId}`,
    'PATCH',
    {
      amount: nextAmount,                 // 次々回以降の継続金額
      next_payment: { amount: nextAmount }, // 次回課金額（これで“次回”から新価格になる）
    },
  );
  console.log(`[Univapay] Subscription next amount updated: ${subscriptionId} -> ${nextAmount}`);
  return result;
}

/**
 * Get subscription details
 */
export async function getSubscription(subscriptionId: string) {
  try {
    const subscription = await univapayRequest(
      `/stores/${UNIVAPAY_STORE_ID}/subscriptions/${subscriptionId}`,
      'GET'
    );
    return subscription;
  } catch (error) {
    console.error('[Univapay] Get subscription error:', error);
    throw error;
  }
}

/**
 * ストアの全サブスク一覧（管理画面「契約・メール」用）
 */
export async function listStoreSubscriptions(limit: number = 100) {
  const result = await univapayRequest(
    `/stores/${UNIVAPAY_STORE_ID}/subscriptions?limit=${limit}`,
    'GET'
  );
  return result?.items ?? [];
}

/**
 * 決済リンク一覧（リンクIDから「何の商品の契約か」を表示するため）
 */
export async function listCheckoutLinks(limit: number = 100) {
  const result = await univapayRequest(
    `/checkout/links?limit=${limit}`,
    'GET'
  );
  return result?.items ?? [];
}

/**
 * Get transaction token details (メールアドレスの取得に使う)
 *
 * Webhookペイロードのmetadataには氏名・電話しか入らないケースがあるため、
 * transaction_token_id からトークンを引いてメールを特定する（実ペイロードで確認済み）。
 */
export async function getTransactionToken(tokenId: string) {
  if (!tokenId) throw new Error('tokenId is required');
  return await univapayRequest(
    `/stores/${UNIVAPAY_STORE_ID}/tokens/${tokenId}`,
    'GET'
  );
}

/**
 * Verify webhook auth token (UnivaPayの実方式)
 *
 * UnivaPayのWebhookはHMAC署名ではなく、Webhook登録時のauth_tokenを
 * Authorizationヘッダに載せて送ってくる（storeのwebhook設定で確認済み）。
 * 「Bearer xxx」形式と生トークンの両方を受け付け、タイミングセーフに比較する。
 */
export function verifyWebhookAuthToken(
  headerValue: string,
  expectedToken: string
): boolean {
  if (!expectedToken || !headerValue) return false;
  const candidate = headerValue.replace(/^Bearer\s+/i, '').trim();
  try {
    const a = Buffer.from(candidate, 'utf8');
    const b = Buffer.from(expectedToken, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!secret) {
    console.warn("[UniVaPay] UNIVAPAY_WEBHOOK_SECRET not configured, skipping verification");
    return false;
  }

  if (!signature) {
    console.warn("[UniVaPay] No signature provided in webhook request");
    return false;
  }

  try {
    const expectedSignature = createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("hex");

    // Timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (sigBuffer.length !== expectedBuffer.length) return false;

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (error) {
    console.error("[UniVaPay] Webhook signature verification error:", error);
    return false;
  }
}

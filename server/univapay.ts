/**
 * Univapay API wrapper for subscription management
 * Using REST API directly (no official SDK available)
 */

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

  try {
    const response = await fetch(url, options);
    
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
 * 重要な前提（Univapay仕様）：
 *  - 「回数制限付き定期課金」では次回課金額を変更できない → キャンペーン契約は回数無制限で作成すること。
 *  - サブスク作成時の「課金金額上限(max amount)」までしか引き上げられない → リンクの上限を通常価格に設定すること。
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
    const crypto = require("crypto");
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("hex");

    // Timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (sigBuffer.length !== expectedBuffer.length) return false;

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (error) {
    console.error("[UniVaPay] Webhook signature verification error:", error);
    return false;
  }
}

/**
 * Univapay API wrapper for subscription management
 * Using REST API directly (no official SDK available)
 */

const UNIVAPAY_API_URL = 'https://api.univapay.com';
const UNIVAPAY_JWT_TOKEN = process.env.UNIVAPAY_JWT_TOKEN!;
const UNIVAPAY_STORE_ID = process.env.UNIVAPAY_STORE_ID!;

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
    'Authorization': `Bearer ${UNIVAPAY_JWT_TOKEN}`,
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

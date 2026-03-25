import Stripe from 'stripe';
import { ENV } from './_core/env';
import { PLANS, TRIAL_DAYS } from '../shared/plans';
import * as db from './db';

// Initialize Stripe with secret key (optional - works without it in dev mode)
let stripe: Stripe;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-11-17.clover',
  });
} else {
  console.warn('[Stripe] No STRIPE_SECRET_KEY configured - Stripe features disabled');
  stripe = new Proxy({} as Stripe, {
    get: () => () => { throw new Error('Stripe is not configured'); }
  });
}

export { stripe };

/**
 * Create or get Stripe customer for a user
 */
export async function getOrCreateStripeCustomer(
  userId: number,
  email: string,
  name?: string | null
): Promise<string> {
  const user = await db.getUserById(userId);
  
  if (user?.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: {
      userId: userId.toString(),
    },
  });

  // Save customer ID to database
  await db.updateUserStripeCustomerId(userId, customer.id);
  
  return customer.id;
}

/**
 * Create Stripe Checkout session for subscription
 */
export async function createCheckoutSession(
  userId: number,
  email: string,
  name: string | null,
  planId: string,
  origin: string
): Promise<string> {
  const plan = PLANS[planId];
  if (!plan) {
    throw new Error(`Invalid plan: ${planId}`);
  }

  if (plan.priceMonthly === 0) {
    throw new Error('Cannot create checkout for free plan');
  }

  // Get or create Stripe customer
  const customerId = await getOrCreateStripeCustomer(userId, email, name);

  // Get or create Stripe price
  let priceId = plan.stripePriceId;
  if (!priceId) {
    priceId = await createStripePrice(planId);
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: userId.toString(),
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: {
        planId,
        userId: userId.toString(),
      },
    },
    success_url: `${origin}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?canceled=true`,
    allow_promotion_codes: true,
    metadata: {
      userId: userId.toString(),
      planId,
      customerEmail: email,
      customerName: name || '',
    },
  });

  return session.url || '';
}

/**
 * Create Stripe product and price for a plan
 */
export async function createStripePrice(planId: string): Promise<string> {
  const plan = PLANS[planId];
  if (!plan) {
    throw new Error(`Invalid plan: ${planId}`);
  }

  // Create product
  const product = await stripe.products.create({
    name: `Threads Studio - ${plan.name}`,
    description: plan.description,
    metadata: {
      planId,
    },
  });

  // Create price
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: plan.priceMonthly,
    currency: 'jpy',
    recurring: {
      interval: 'month',
    },
    metadata: {
      planId,
    },
  });

  // Update plan with price ID
  await db.updatePlanStripePriceId(planId, price.id);

  return price.id;
}

/**
 * Create Stripe billing portal session
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}

/**
 * Cancel subscription at period end
 */
export async function cancelSubscription(stripeSubscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
}

/**
 * Resume canceled subscription
 */
export async function resumeSubscription(stripeSubscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: false,
  });
}

/**
 * Change subscription plan
 */
export async function changePlan(
  stripeSubscriptionId: string,
  newPlanId: string
): Promise<void> {
  const plan = PLANS[newPlanId];
  if (!plan || plan.priceMonthly === 0) {
    throw new Error(`Invalid plan: ${newPlanId}`);
  }

  let priceId = plan.stripePriceId;
  if (!priceId) {
    priceId = await createStripePrice(newPlanId);
  }

  // Get current subscription
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const itemId = subscription.items.data[0]?.id;

  if (!itemId) {
    throw new Error('No subscription item found');
  }

  // Update subscription with new price
  await stripe.subscriptions.update(stripeSubscriptionId, {
    items: [
      {
        id: itemId,
        price: priceId,
      },
    ],
    proration_behavior: 'create_prorations',
    metadata: {
      planId: newPlanId,
    },
  });
}

/**
 * Get subscription details from Stripe
 */
export async function getStripeSubscription(stripeSubscriptionId: string) {
  return await stripe.subscriptions.retrieve(stripeSubscriptionId);
}

/**
 * Get customer's payment methods
 */
export async function getPaymentMethods(customerId: string) {
  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  });

  return paymentMethods.data;
}

/**
 * Get customer's invoices
 */
export async function getInvoices(customerId: string, limit = 10) {
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit,
  });

  return invoices.data;
}

/**
 * Calculate proration amount for plan change
 * Returns the estimated amount that will be charged/credited
 */
export async function calculatePlanChangeProration(
  stripeSubscriptionId: string,
  newPlanId: string
): Promise<{
  proratedAmount: number;
  currentPlanPrice: number;
  newPlanPrice: number;
  isUpgrade: boolean;
  nextBillingDate: Date;
}> {
  const newPlan = PLANS[newPlanId];
  if (!newPlan || newPlan.priceMonthly === 0) {
    throw new Error(`Invalid plan: ${newPlanId}`);
  }

  // Get current subscription
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const currentPrice = subscription.items.data[0]?.price;
  
  if (!currentPrice) {
    throw new Error('No current price found');
  }

  const currentPlanPrice = currentPrice.unit_amount || 0;
  const newPlanPrice = newPlan.priceMonthly;
  const isUpgrade = newPlanPrice > currentPlanPrice;

  // Get or create new price
  let newPriceId = newPlan.stripePriceId;
  if (!newPriceId) {
    newPriceId = await createStripePrice(newPlanId);
  }

  // Preview invoice to get proration amount
  try {
    const upcomingInvoice = await stripe.invoices.retrieve('upcoming', {
      customer: subscription.customer as string,
      subscription: stripeSubscriptionId,
      subscription_items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId,
        },
      ] as any,
      subscription_proration_behavior: 'create_prorations',
    } as any);

    return {
      proratedAmount: upcomingInvoice.amount_due || 0,
      currentPlanPrice,
      newPlanPrice,
      isUpgrade,
      nextBillingDate: new Date((subscription as any).current_period_end * 1000),
    };
  } catch (error) {
    // If preview fails, estimate based on price difference
    const priceDiff = newPlanPrice - currentPlanPrice;
    return {
      proratedAmount: Math.max(0, priceDiff),
      currentPlanPrice,
      newPlanPrice,
      isUpgrade,
      nextBillingDate: new Date((subscription as any).current_period_end * 1000),
    };
  }
}

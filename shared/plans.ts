/**
 * Subscription plans configuration
 * Centralized plan definitions for consistency across the application
 */

export interface PlanFeatures {
  maxProjects: number;
  maxThreadsAccounts: number;
  maxScheduledPosts: number;
  maxAiGenerations: number; // -1 for unlimited, 0 for none
  hasPrioritySupport: boolean;
  hasApiAccess?: boolean;
}

export interface PlanConfig {
  id: string;
  name: string;
  description: string;
  priceMonthly: number; // Price in JPY
  stripePriceId?: string; // Will be set after creating Stripe products
  univapayLinkUrl?: string; // Univapay link form URL
  features: PlanFeatures;
  popular?: boolean;
}

export const PLANS: Record<string, PlanConfig> = {
  free: {
    id: 'free',
    name: 'フリープラン',
    description: '無料でお試し',
    priceMonthly: 0,
    features: {
      maxProjects: 1,
      maxThreadsAccounts: 1,
      maxScheduledPosts: 3,
      maxAiGenerations: 3,
      hasPrioritySupport: false,
      hasApiAccess: false,
    },
  },
  light: {
    id: 'light',
    name: 'ライトプラン',
    description: '個人利用・小規模店舗向け',
    priceMonthly: 2980,
    univapayLinkUrl: 'https://univa.cc/ecEkZB',
    features: {
      maxProjects: 3,
      maxThreadsAccounts: 1,
      maxScheduledPosts: 10,
      maxAiGenerations: 10, // 月10回まで
      hasPrioritySupport: false,
      hasApiAccess: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'プロプラン',
    description: 'AI投稿生成で集客を加速',
    priceMonthly: 9800,
    univapayLinkUrl: 'https://univa.cc/vy43QS',
    popular: true,
    features: {
      maxProjects: 10,
      maxThreadsAccounts: 3,
      maxScheduledPosts: 100,
      maxAiGenerations: -1, // 無制限
      hasPrioritySupport: false,
      hasApiAccess: false,
    },
  },
  business: {
    id: 'business',
    name: 'ビジネスプラン',
    description: '複数店舗・チーム運用向け',
    priceMonthly: 29800,
    univapayLinkUrl: 'https://univa.cc/pC3r5d',
    features: {
      maxProjects: 50,
      maxThreadsAccounts: 10,
      maxScheduledPosts: 500,
      maxAiGenerations: -1, // 無制限
      hasPrioritySupport: true,
      hasApiAccess: true,
    },
  },
  agency: {
    id: 'agency',
    name: '代理店プラン',
    description: '代理店ビジネス向け最上位プラン',
    priceMonthly: 50000,
    univapayLinkUrl: 'https://univa.cc/Z2dqJa',
    features: {
      maxProjects: -1, // Unlimited
      maxThreadsAccounts: -1, // Unlimited
      maxScheduledPosts: -1, // Unlimited
      maxAiGenerations: -1, // 無制限
      hasPrioritySupport: true,
      hasApiAccess: true,
    },
  },
};

export const PLAN_IDS = Object.keys(PLANS) as Array<keyof typeof PLANS>;

export const TRIAL_DAYS = 7;

/**
 * Get plan by ID
 */
export function getPlan(planId: string): PlanConfig | undefined {
  return PLANS[planId];
}

/**
 * Check if a feature is available for a plan
 */
export function hasFeature(planId: string, feature: keyof PlanFeatures): boolean {
  const plan = getPlan(planId);
  if (!plan) return false;
  
  const value = plan.features[feature];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return false;
}

/**
 * Check if limit is exceeded for a plan
 */
export function isLimitExceeded(planId: string, feature: keyof PlanFeatures, currentCount: number): boolean {
  const plan = getPlan(planId);
  if (!plan) return true;
  
  const limit = plan.features[feature];
  if (typeof limit !== 'number') return false;
  if (limit === -1) return false; // Unlimited
  
  return currentCount >= limit;
}

/**
 * Get feature limit display text
 */
export function getFeatureLimitText(limit: number): string {
  if (limit === -1) return '無制限';
  if (limit === 0) return 'なし';
  return `${limit}件`;
}

/**
 * Get AI generation limit display text
 */
export function getAiGenerationLimitText(limit: number): string {
  if (limit === -1) return '無制限';
  if (limit === 0) return '利用不可';
  return `月${limit}回`;
}

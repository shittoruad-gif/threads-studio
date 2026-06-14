/**
 * Subscription plans configuration
 * Centralized plan definitions for consistency across the application
 */

export interface PlanFeatures {
  maxProjects: number;
  maxThreadsAccounts: number;
  maxScheduledPosts: number;
  maxAiGenerations: number; // -1 for unlimited, 0 for none
  /**
   * 自動投稿の「1日あたり最大回数」。0 = 自動投稿なし。
   * 料金表ではこの値を「1日◯回」として表示し、実態（autoPostScheduler）でも上限にする。
   * maxScheduledPosts（月間総数）は、この日次回数×31＋手動分を上回る安全弁として設定する。
   */
  maxAutoPostsPerDay: number;
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
  /** キャンペーンプランか（3回課金で自動終了→無料に戻る） */
  isCampaign?: boolean;
  /** キャンペーン終了までの課金回数（isCampaign時のみ） */
  campaignCharges?: number;
  /** キャンペーン終了後に案内する通常プランのID（isCampaign時のみ） */
  normalCounterpartId?: string;
}

// ライト/プロ/ビジネスの機能定義（通常・キャンペーン共通で参照）
const FEATURES_LIGHT: PlanFeatures = {
  maxProjects: 3,
  maxThreadsAccounts: 1,
  maxAutoPostsPerDay: 1,        // 1日1回
  maxScheduledPosts: 40,        // 1日1回×31日＋手動分の安全弁
  maxAiGenerations: 10,
  hasPrioritySupport: false,
  hasApiAccess: false,
};
const FEATURES_PRO: PlanFeatures = {
  maxProjects: 10,
  maxThreadsAccounts: 3,
  maxAutoPostsPerDay: 3,        // 1日3回
  maxScheduledPosts: 120,       // 1日3回×31日（93）＋手動分の安全弁
  maxAiGenerations: -1,
  hasPrioritySupport: false,
  hasApiAccess: false,
};
const FEATURES_BUSINESS: PlanFeatures = {
  maxProjects: 50,
  maxThreadsAccounts: 10,
  maxAutoPostsPerDay: 3,        // 1日3回（連携アカウントを切替えて運用）
  maxScheduledPosts: 500,
  maxAiGenerations: -1,
  hasPrioritySupport: true,
  hasApiAccess: true,
};

export const PLANS: Record<string, PlanConfig> = {
  free: {
    id: 'free',
    name: 'フリープラン',
    description: '無料でお試し',
    priceMonthly: 0,
    features: {
      maxProjects: 1,
      maxThreadsAccounts: 1,
      maxAutoPostsPerDay: 0,     // フリーは自動投稿なし（手動でお試し）
      maxScheduledPosts: 3,
      maxAiGenerations: 3,
      hasPrioritySupport: false,
      hasApiAccess: false,
    },
  },

  // ───────── キャンペーンプラン（3回課金で自動終了→無料に戻る）─────────
  light_campaign: {
    id: 'light_campaign',
    name: 'ライト キャンペーン',
    description: '3ヶ月お試し価格（3回課金で自動終了）。機能はライトプランと同じ',
    priceMonthly: 2980,
    univapayLinkUrl: 'https://univa.cc/2Tfu-Z',
    isCampaign: true,
    campaignCharges: 3,
    normalCounterpartId: 'light',
    features: { ...FEATURES_LIGHT },
  },
  pro_campaign: {
    id: 'pro_campaign',
    name: 'プロ キャンペーン',
    description: '3ヶ月お試し価格（3回課金で自動終了）。機能はプロプランと同じ',
    priceMonthly: 6980,
    univapayLinkUrl: 'https://univa.cc/qm0Uj5',
    isCampaign: true,
    campaignCharges: 3,
    normalCounterpartId: 'pro',
    popular: true,
    features: { ...FEATURES_PRO },
  },
  business_campaign: {
    id: 'business_campaign',
    name: 'ビジネス キャンペーン',
    description: '3ヶ月お試し価格（3回課金で自動終了）。機能はビジネスプランと同じ',
    priceMonthly: 19800,
    univapayLinkUrl: 'https://univa.cc/HJNLau',
    isCampaign: true,
    campaignCharges: 3,
    normalCounterpartId: 'business',
    features: { ...FEATURES_BUSINESS },
  },

  // ───────── 通常プラン（継続課金）─────────
  light: {
    id: 'light',
    name: 'ライトプラン',
    description: '個人利用・小規模店舗向け',
    priceMonthly: 4980,
    univapayLinkUrl: 'https://univa.cc/CEmTK2',
    features: { ...FEATURES_LIGHT },
  },
  pro: {
    id: 'pro',
    name: 'プロプラン',
    description: 'AI投稿生成で集客を加速',
    priceMonthly: 9800,
    univapayLinkUrl: 'https://univa.cc/tprohn',
    popular: true,
    features: { ...FEATURES_PRO },
  },
  business: {
    id: 'business',
    name: 'ビジネスプラン',
    description: '複数店舗・チーム運用向け',
    priceMonthly: 29800,
    univapayLinkUrl: 'https://univa.cc/W4Cxr3',
    features: { ...FEATURES_BUSINESS },
  },
  agency: {
    id: 'agency',
    name: '代理店プラン',
    description: '代理店ビジネス向け最上位プラン',
    priceMonthly: 55000,
    univapayLinkUrl: 'https://univa.cc/loi7Uw',
    features: {
      maxProjects: -1,
      maxThreadsAccounts: -1,
      maxAutoPostsPerDay: 3,     // 自動投稿は1日最大3回（手動は無制限）
      maxScheduledPosts: -1,
      maxAiGenerations: -1,
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

// ───────── キャンペーン料金表示（モニター登録者向けの自動表示）─────────
// キャンペーンコードはDBクーポン（type: monitor_only）として管理。
// クーポン適用でユーザーがモニター化されると、料金ページがキャンペーン価格を自動表示する。

/** 「限定◯名」表示用の総枠数（演出のみ・実際の登録制限はかけない） */
export const CAMPAIGN_SLOT_TOTAL = 10;

/** 残り枠カウントダウンの起点（JST） */
const CAMPAIGN_COUNTDOWN_START = '2026-05-21T00:00:00+09:00';

/**
 * 「残り◯名」の表示用カウント（演出のみ）。
 * 起点日から5日ごとに1名ずつ減り、最低2名で止まる。
 * 実際の登録数とは無関係で、登録制限もかけない。
 */
export function getCampaignSlotsRemaining(now: Date = new Date()): number {
  const start = new Date(CAMPAIGN_COUNTDOWN_START).getTime();
  const days = Math.max(0, Math.floor((now.getTime() - start) / 86_400_000));
  return Math.max(2, CAMPAIGN_SLOT_TOTAL - 1 - Math.floor(days / 5));
}

/**
 * 通常プランIDに対応するキャンペーンプランを返す（なければundefined）。
 */
export function getCampaignCounterpart(normalPlanId: string): PlanConfig | undefined {
  return Object.values(PLANS).find(
    (p) => p.isCampaign && p.normalCounterpartId === normalPlanId,
  );
}

/**
 * サブスクの status を考慮した「実効プランID」を返す。
 * active / trialing 以外（canceled / past_due / unpaid / incomplete）は
 * 有料機能を使わせないため 'free' 扱いにする。
 * （解約・決済失敗後も planId が残って有料機能が使えてしまう課金漏れを防ぐ）
 */
export function resolveEffectivePlanId(
  planId: string | null | undefined,
  status: string | null | undefined,
): string {
  if (!planId) return 'free';
  if (status === 'active' || status === 'trialing') return planId;
  return 'free';
}

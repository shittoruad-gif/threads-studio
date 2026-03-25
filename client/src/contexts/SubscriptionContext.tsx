import React, { createContext, useContext, ReactNode } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

interface PlanFeatures {
  maxProjects: number;
  maxThreadsAccounts: number;
  maxScheduledPosts: number;
  maxAiGenerations: number; // -1 for unlimited, 0 for none
  hasPrioritySupport: boolean;
  hasApiAccess?: boolean;
}

interface PlanConfig {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  features: PlanFeatures;
  popular?: boolean;
}

interface SubscriptionStatus {
  planId: string;
  plan: PlanConfig;
  status: 'trialing' | 'active' | 'canceled' | 'past_due' | 'unpaid' | 'incomplete';
  isTrialing: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

interface SubscriptionContextType {
  subscription: SubscriptionStatus | null;
  isLoading: boolean;
  isSubscribed: boolean;
  isPro: boolean;
  isBusiness: boolean;
  canUseFeature: (feature: keyof PlanFeatures) => boolean;
  getLimit: (feature: keyof PlanFeatures) => number;
  refetch: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  
  const { data: subscription, isLoading, refetch } = trpc.subscription.getStatus.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const isSubscribed = subscription?.status === 'active' || subscription?.status === 'trialing';
  const isPro = isSubscribed && (subscription?.planId === 'pro' || subscription?.planId === 'business');
  const isBusiness = isSubscribed && subscription?.planId === 'business';

  const canUseFeature = (feature: keyof PlanFeatures): boolean => {
    if (!subscription?.plan) return false;
    const value = subscription.plan.features[feature];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return false;
  };

  const getLimit = (feature: keyof PlanFeatures): number => {
    if (!subscription?.plan) return 0;
    const value = subscription.plan.features[feature];
    if (typeof value === 'number') return value;
    return 0;
  };

  return (
    <SubscriptionContext.Provider
      value={{
        subscription: subscription || null,
        isLoading,
        isSubscribed,
        isPro,
        isBusiness,
        canUseFeature,
        getLimit,
        refetch,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

/**
 * Helper to format feature limit for display
 */
export function formatLimit(limit: number): string {
  if (limit === -1) return '無制限';
  if (limit === 0) return 'なし';
  return `${limit}件`;
}

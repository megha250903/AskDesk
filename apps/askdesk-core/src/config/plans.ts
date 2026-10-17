export interface PlanLimits {
  requestsPerDay: number;
  documentsLimit: number;
  maxTeamMembers: number;
  priceUsd: number;
  stripePriceId?: string;
}

export const PLANS: Record<'free' | 'pro' | 'enterprise', PlanLimits> = {
  free: {
    requestsPerDay: 100,
    documentsLimit: 10,
    maxTeamMembers: 3,
    priceUsd: 0
  },
  pro: {
    requestsPerDay: 50_000,
    documentsLimit: 500,
    maxTeamMembers: -1, // Unlimited
    priceUsd: 49,
    stripePriceId: 'price_pro_monthly_mock'
  },
  enterprise: {
    requestsPerDay: 1_000_000,
    documentsLimit: 10_000,
    maxTeamMembers: -1,
    priceUsd: 499,
    stripePriceId: 'price_enterprise_mock'
  }
};

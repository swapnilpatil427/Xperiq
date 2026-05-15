// Plan-tier feature flags — separate from RBAC role gates.
// These control which features are available based on the org's subscription plan.

export type PlanTier = 'free' | 'starter' | 'business' | 'enterprise';

const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  starter: 1,
  business: 2,
  enterprise: 3,
};

export interface FeatureFlags {
  // Available on all plans
  surveyCreation: boolean;
  basicAnalytics: boolean;
  // Starter+
  aiGeneration: boolean;
  customBranding: boolean;
  teamMembers: boolean;     // up to 5 members
  // Business+
  advancedAnalytics: boolean;
  workflowAutomation: boolean;
  apiAccess: boolean;
  unlimitedMembers: boolean;
  // Enterprise only
  sso: boolean;
  auditLog: boolean;
  whiteLabel: boolean;
  customDomain: boolean;
  scim: boolean;
  // Derived
  isEnterprisePlan: boolean;
  plan: PlanTier;
}

export function getFeatureFlags(plan: PlanTier = 'free'): FeatureFlags {
  const rank = PLAN_RANK[plan];
  return {
    surveyCreation:    true,
    basicAnalytics:    true,
    aiGeneration:      rank >= PLAN_RANK.starter,
    customBranding:    rank >= PLAN_RANK.starter,
    teamMembers:       rank >= PLAN_RANK.starter,
    advancedAnalytics: rank >= PLAN_RANK.business,
    workflowAutomation:rank >= PLAN_RANK.business,
    apiAccess:         rank >= PLAN_RANK.business,
    unlimitedMembers:  rank >= PLAN_RANK.business,
    sso:               rank >= PLAN_RANK.enterprise,
    auditLog:          rank >= PLAN_RANK.enterprise,
    whiteLabel:        rank >= PLAN_RANK.enterprise,
    customDomain:      rank >= PLAN_RANK.enterprise,
    scim:              rank >= PLAN_RANK.enterprise,
    isEnterprisePlan:  rank >= PLAN_RANK.enterprise,
    plan,
  };
}

// For enterprise mode badge: org qualifies if ≥5 members OR Business+ plan
export function isEnterpriseMode(memberCount: number, plan: PlanTier): boolean {
  return memberCount >= 5 || PLAN_RANK[plan] >= PLAN_RANK.business;
}

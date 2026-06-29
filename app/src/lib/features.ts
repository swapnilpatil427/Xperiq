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
  // Phase 0.5 — Insight Pipeline v2 investigation trajectory (Enhanced Header
  // Band + Investigation Drawer + Topic Change Bar). Off only when explicitly
  // disabled via VITE_INSIGHTS_TRAJECTORY_V1='false'; on for all tiers otherwise.
  insightsTrajectoryV1: boolean;
  // Phase 4 — Insight Trail page. Off by default until the Trail ships to
  // production. Set VITE_SHOW_INSIGHT_TRAIL='true' to preview in dev.
  showInsightTrail: boolean;
  // Derived
  isEnterprisePlan: boolean;
  plan: PlanTier;
}

// Resolve the trajectory flag from env. Defaults ON (dev + all tiers); set
// VITE_INSIGHTS_TRAJECTORY_V1='false' to disable. The Phase 4 Trail UI flag is
// separate and stays OFF until that work ships.
function resolveTrajectoryFlag(): boolean {
  const v = import.meta.env.VITE_INSIGHTS_TRAJECTORY_V1;
  if (v == null) return true;
  return String(v).toLowerCase() !== 'false';
}

// Resolve the Trail flag from env. Defaults OFF; set VITE_SHOW_INSIGHT_TRAIL='true'
// to enable in development before the full Phase 4 ship.
function resolveTrailFlag(): boolean {
  const v = import.meta.env.VITE_SHOW_INSIGHT_TRAIL;
  if (v == null) return false;
  return String(v).toLowerCase() === 'true';
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
    insightsTrajectoryV1: resolveTrajectoryFlag(),
    showInsightTrail: resolveTrailFlag(),
    isEnterprisePlan:  rank >= PLAN_RANK.enterprise,
    plan,
  };
}

// For enterprise mode badge: org qualifies if ≥5 members OR Business+ plan
export function isEnterpriseMode(memberCount: number, plan: PlanTier): boolean {
  return memberCount >= 5 || PLAN_RANK[plan] >= PLAN_RANK.business;
}

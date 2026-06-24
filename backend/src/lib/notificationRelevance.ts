// Smart notification suppression (docs/notifications §7.3).
//
// Crystal computes a relevance_score for each potential notification; low-relevance
// non-critical notifications are suppressed (routed to digest). Critical is never
// suppressed. Also caps repetitive low-priority noise: if the user already has 3+
// unread `info` notifications for the same entity, suppress new `info`.
//
// Pure scoring (testable). createNotification calls shouldSuppress().

const PRIORITY_WEIGHT: Record<string, number> = { critical: 1.0, warning: 0.8, success: 0.55, info: 0.4, digest: 0.2 };
const SUPPRESS_THRESHOLD = 0.4;

interface RelevanceParams {
  priority?: string;
  magnitude?: number;
  recencyHours?: number;
  unreadSameEntityInfo?: number;
}

/**
 * Relevance score 0..1.
 * @param f
 * @param f.priority
 * @param f.magnitude   normalized 0..1 size of the change (e.g. |delta|/scale)
 * @param f.recencyHours hours since the related event (fresher = higher)
 */
function relevanceScore({ priority = 'info', magnitude = 0.5, recencyHours = 0 }: RelevanceParams): number {
  const base = PRIORITY_WEIGHT[priority] ?? 0.4;
  const mag = Math.max(0, Math.min(1, magnitude));
  // Recency decay: full weight < 24h, fading to ~0 by a week.
  const recency = recencyHours <= 24 ? 1 : Math.max(0, 1 - (recencyHours - 24) / (6 * 24));
  // Weighted blend; priority dominates so critical/warning stay high.
  const score = 0.55 * base + 0.30 * mag + 0.15 * recency;
  return Math.round(score * 100) / 100;
}

/**
 * Decide whether to suppress. Returns { suppress, score, reason }.
 * @param n  { priority, magnitude?, recencyHours?, unreadSameEntityInfo? }
 */
function shouldSuppress(n: RelevanceParams): { suppress: boolean; score: number; reason: string | null } {
  if (n.priority === 'critical') return { suppress: false, score: 1, reason: null };

  // Cap repetitive info noise for the same entity.
  if (n.priority === 'info' && (n.unreadSameEntityInfo || 0) >= 3) {
    return { suppress: true, score: 0, reason: 'info_fatigue' };
  }

  const score = relevanceScore(n);
  if (score < SUPPRESS_THRESHOLD) return { suppress: true, score, reason: 'low_relevance' };
  return { suppress: false, score, reason: null };
}

export { relevanceScore, shouldSuppress, SUPPRESS_THRESHOLD, PRIORITY_WEIGHT };
